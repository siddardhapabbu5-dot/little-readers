import { randomUUID } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  isPastPublishTime,
  kolkataCalendarDateUtc,
  startOfUtcDay,
} from "./kolkata-time.js";

const WORKER_ID = `api-${process.pid}-${randomUUID().slice(0, 8)}`;
const CLAIM_STALE_MS = 2 * 60 * 1000;
const RETRY_BASE_MS = 30_000;

export async function ensurePublisherConfig() {
  return prisma.vocabPublisherConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      timezone: "Asia/Kolkata",
      publishHour: 6,
      publishMinute: 0,
      status: "RUNNING",
    },
    update: {},
  });
}

export async function getPublisherConfig() {
  return ensurePublisherConfig();
}

export async function updatePublisherConfig(input: {
  publishHour?: number;
  publishMinute?: number;
  timezone?: string;
  status?: "RUNNING" | "PAUSED" | "STOPPED";
  updatedById?: string;
}) {
  await ensurePublisherConfig();
  if (input.publishHour != null && (input.publishHour < 0 || input.publishHour > 23)) {
    throw new AppError("publishHour must be 0–23", 400);
  }
  if (
    input.publishMinute != null &&
    (input.publishMinute < 0 || input.publishMinute > 59)
  ) {
    throw new AppError("publishMinute must be 0–59", 400);
  }
  return prisma.vocabPublisherConfig.update({
    where: { id: "default" },
    data: {
      ...(input.publishHour != null ? { publishHour: input.publishHour } : {}),
      ...(input.publishMinute != null ? { publishMinute: input.publishMinute } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.updatedById ? { updatedById: input.updatedById } : {}),
    },
  });
}

export async function listAdminAlerts(take = 50) {
  return prisma.adminAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, take)),
  });
}

export async function markAlertRead(id: string) {
  return prisma.adminAlert.update({
    where: { id },
    data: { isRead: true },
  });
}

async function createAdminAlert(input: {
  type: string;
  title: string;
  body: string;
  programmeId?: string;
  dayId?: string;
}) {
  return prisma.adminAlert.create({
    data: {
      type: input.type,
      title: input.title,
      body: input.body,
      programmeId: input.programmeId,
      dayId: input.dayId,
    },
  });
}

/** Words that appear on a future/unpublished day of an ACTIVE programme should stay hidden. */
export async function hideFutureProgrammeWords(programmeId: string) {
  const days = await prisma.vocabProgrammeDay.findMany({
    where: { programmeId, status: "SCHEDULED" },
    include: { items: { select: { vocabularyWordId: true } } },
  });
  const wordIds = [...new Set(days.flatMap((d) => d.items.map((i) => i.vocabularyWordId)))];
  if (!wordIds.length) return { hidden: 0 };
  await prisma.vocabularyWord.updateMany({
    where: { id: { in: wordIds } },
    data: { isActive: false },
  });
  return { hidden: wordIds.length };
}

export async function enqueuePublishJobsForProgramme(programmeId: string) {
  const days = await prisma.vocabProgrammeDay.findMany({
    where: { programmeId, status: "SCHEDULED" },
    orderBy: { date: "asc" },
  });
  let created = 0;
  for (const day of days) {
    const existing = await prisma.vocabPublishJob.findUnique({
      where: { dayId: day.id },
    });
    if (existing) {
      if (existing.status === "CANCELLED" || existing.status === "FAILED") {
        await prisma.vocabPublishJob.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            attempts: 0,
            nextAttemptAt: new Date(),
            lastError: null,
            claimedAt: null,
            claimedBy: null,
            completedAt: null,
          },
        });
      }
      continue;
    }
    await prisma.vocabPublishJob.create({
      data: {
        dayId: day.id,
        programmeId,
        dueDate: startOfUtcDay(day.date),
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });
    created += 1;
  }
  return { created, totalDays: days.length };
}

/**
 * Publish one programme day: activate its words, mark PUBLISHED, write history.
 * Idempotent if day already PUBLISHED.
 */
export async function publishProgrammeDay(dayId: string, workerId = WORKER_ID) {
  const day = await prisma.vocabProgrammeDay.findUnique({
    where: { id: dayId },
    include: {
      programme: true,
      items: true,
      publishJob: true,
    },
  });
  if (!day) throw new AppError("Programme day not found", 404);
  if (day.programme.status !== "ACTIVE") {
    throw new AppError("Programme is not ACTIVE", 400);
  }

  if (day.status === "PUBLISHED") {
    await prisma.vocabProgrammePublishLog.create({
      data: {
        dayId,
        result: "SKIPPED_ALREADY_PUBLISHED",
        error: null,
      },
    });
    if (day.publishJob && day.publishJob.status !== "SUCCEEDED") {
      await prisma.vocabPublishJob.update({
        where: { id: day.publishJob.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          claimedBy: workerId,
        },
      });
    }
    return { dayId, status: "PUBLISHED" as const, duplicate: true };
  }

  const wordIds = day.items.map((i) => i.vocabularyWordId);
  await prisma.$transaction(async (tx) => {
    if (wordIds.length) {
      await tx.vocabularyWord.updateMany({
        where: { id: { in: wordIds } },
        data: { isActive: true },
      });
    }
    await tx.vocabProgrammeDay.update({
      where: { id: dayId },
      data: { status: "PUBLISHED" },
    });
    await tx.vocabProgrammePublishLog.create({
      data: {
        dayId,
        result: "PUBLISHED",
        error: null,
      },
    });
    if (day.publishJob) {
      await tx.vocabPublishJob.update({
        where: { id: day.publishJob.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          claimedBy: workerId,
          lastError: null,
        },
      });
    }
  });

  return { dayId, status: "PUBLISHED" as const, duplicate: false, wordCount: wordIds.length };
}

async function failJob(
  jobId: string,
  dayId: string,
  programmeId: string,
  error: string,
  attempts: number,
  maxAttempts: number
) {
  const retryable = attempts < maxAttempts;
  await prisma.vocabPublishJob.update({
    where: { id: jobId },
    data: {
      status: retryable ? "PENDING" : "FAILED",
      lastError: error,
      nextAttemptAt: retryable
        ? new Date(Date.now() + RETRY_BASE_MS * Math.min(attempts, 8))
        : undefined,
      claimedAt: null,
      claimedBy: null,
      ...(retryable ? {} : { completedAt: new Date() }),
    },
  });
  await prisma.vocabProgrammeDay.update({
    where: { id: dayId },
    data: { status: retryable ? "SCHEDULED" : "FAILED" },
  });
  await prisma.vocabProgrammePublishLog.create({
    data: {
      dayId,
      result: retryable ? "RETRY" : "FAILED",
      error,
    },
  });
  if (!retryable) {
    await createAdminAlert({
      type: "PROGRAMME_PUBLISH_FAILED",
      title: "Vocabulary day publish failed",
      body: `Day ${dayId} for programme ${programmeId} failed after ${attempts} attempts: ${error}`,
      programmeId,
      dayId,
    });
  }
}

/**
 * Mark ACTIVE programmes COMPLETED when Kolkata calendar date is past endDate.
 * Does NOT create or activate any next programme.
 */
export async function completeExpiredProgrammes(now = new Date()) {
  const today = kolkataCalendarDateUtc(now);
  const expired = await prisma.vocabProgramme.findMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: today },
    },
    select: { id: true, title: true },
  });
  for (const prog of expired) {
    await prisma.vocabProgramme.update({
      where: { id: prog.id },
      data: { status: "COMPLETED" },
    });
    await prisma.vocabPublishJob.updateMany({
      where: {
        programmeId: prog.id,
        status: { in: ["PENDING", "CLAIMED", "FAILED"] },
      },
      data: { status: "CANCELLED", completedAt: now },
    });
    await createAdminAlert({
      type: "PROGRAMME_COMPLETED",
      title: "Programme completed",
      body: `Programme "${prog.title}" reached end date and was marked COMPLETED. No next programme was auto-activated.`,
      programmeId: prog.id,
    });
  }
  return { completed: expired.length };
}

/** Claim and process due jobs. Safe to call from interval / tests. */
export async function processDuePublishJobs(now = new Date()) {
  const expired = await completeExpiredProgrammes(now);

  const config = await ensurePublisherConfig();
  if (config.status === "STOPPED" || config.status === "PAUSED") {
    return {
      skipped: true as const,
      reason: config.status,
      processed: 0,
      programmesCompleted: expired.completed,
    };
  }

  const todayKolkata = kolkataCalendarDateUtc(now);
  const pastTime = isPastPublishTime(config.publishHour, config.publishMinute, now);

  // Recover stale claims
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  await prisma.vocabPublishJob.updateMany({
    where: {
      status: "CLAIMED",
      claimedAt: { lt: staleBefore },
    },
    data: { status: "PENDING", claimedAt: null, claimedBy: null },
  });

  const candidates = await prisma.vocabPublishJob.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
      dueDate: { lte: todayKolkata },
      day: { status: { in: ["SCHEDULED", "FAILED"] }, programme: { status: "ACTIVE" } },
    },
    orderBy: [{ dueDate: "asc" }, { nextAttemptAt: "asc" }],
    take: 25,
  });

  let processed = 0;
  for (const job of candidates) {
    // Future calendar date relative to Kolkata "today" already filtered.
    // Same-day jobs wait until configured publish time (missed days always run).
    const due = startOfUtcDay(job.dueDate);
    if (due.getTime() === todayKolkata.getTime() && !pastTime) {
      continue;
    }

    const claimed = await prisma.vocabPublishJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: "CLAIMED",
        claimedAt: now,
        claimedBy: WORKER_ID,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    const fresh = await prisma.vocabPublishJob.findUnique({ where: { id: job.id } });
    if (!fresh) continue;

    try {
      await publishProgrammeDay(job.dayId, WORKER_ID);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(
        job.id,
        job.dayId,
        job.programmeId,
        message,
        fresh.attempts,
        fresh.maxAttempts
      );
    }
  }

  return {
    skipped: false as const,
    processed,
    examined: candidates.length,
    programmesCompleted: expired.completed,
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startProgrammePublisher(intervalMs = 30_000) {
  if (timer) return;
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    // Tests call processDuePublishJobs explicitly.
    return;
  }
  const tick = () => {
    processDuePublishJobs().catch((err) => {
      console.error("[programme-publisher]", err);
    });
  };
  tick();
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `[programme-publisher] started (Asia/Kolkata, every ${intervalMs}ms, worker=${WORKER_ID})`
  );
}

export function stopProgrammePublisher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
