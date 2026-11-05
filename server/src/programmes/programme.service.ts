import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  enqueuePublishJobsForProgramme,
  hideFutureProgrammeWords,
} from "./publisher.service.js";
import { startOfUtcDay } from "./kolkata-time.js";

function eachDateInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = startOfUtcDay(start);
  const last = startOfUtcDay(end);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

const programmeInclude = {
  grade: { select: { id: true, code: true, label: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  activatedBy: { select: { id: true, name: true, email: true } },
  _count: { select: { days: true } },
} as const;

export async function listProgrammes() {
  return prisma.vocabProgramme.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: programmeInclude,
  });
}

export async function getProgramme(id: string) {
  const row = await prisma.vocabProgramme.findUnique({
    where: { id },
    include: {
      ...programmeInclude,
      days: {
        orderBy: { date: "asc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              vocabularyWord: {
                select: {
                  id: true,
                  text: true,
                  meaning: true,
                  emoji: true,
                  isActive: true,
                  category: { select: { id: true, label: true } },
                },
              },
            },
          },
          logs: { orderBy: { ranAt: "desc" }, take: 5 },
        },
      },
    },
  });
  if (!row) throw new AppError("Programme not found", 404);
  return row;
}

export async function createProgramme(input: {
  title: string;
  gradeId: string;
  startDate: string;
  endDate: string;
  dailyTarget?: number;
  createdById: string;
}) {
  const grade = await prisma.learningGrade.findUnique({
    where: { id: input.gradeId },
  });
  if (!grade) throw new AppError("Grade not found", 404);
  const start = startOfUtcDay(new Date(input.startDate));
  const end = startOfUtcDay(new Date(input.endDate));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError("Invalid start or end date", 400);
  }
  if (end.getTime() < start.getTime()) {
    throw new AppError("endDate must be on or after startDate", 400);
  }
  const dailyTarget = Math.max(1, Math.min(20, input.dailyTarget ?? 1));

  return prisma.vocabProgramme.create({
    data: {
      title: input.title.trim(),
      gradeId: input.gradeId,
      startDate: start,
      endDate: end,
      dailyTarget,
      timezone: "Asia/Kolkata",
      status: "DRAFT",
      createdById: input.createdById,
    },
    include: programmeInclude,
  });
}

/** Fill days from active words in the programme grade (round-robin). */
export async function generateProgrammeSchedule(programmeId: string) {
  const programme = await prisma.vocabProgramme.findUnique({
    where: { id: programmeId },
    include: { grade: true },
  });
  if (!programme) throw new AppError("Programme not found", 404);
  if (programme.status !== "DRAFT" && programme.status !== "APPROVED") {
    throw new AppError("Only DRAFT or APPROVED programmes can regenerate", 400);
  }

  const words = await prisma.vocabularyWord.findMany({
    where: {
      isActive: true,
      category: { group: { level: { gradeId: programme.gradeId } } },
    },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { text: "asc" }],
    select: { id: true },
  });
  if (!words.length) {
    throw new AppError("No active words in this grade to schedule", 400);
  }

  const dates = eachDateInclusive(programme.startDate, programme.endDate);
  await prisma.$transaction(async (tx) => {
    await tx.vocabProgrammeDay.deleteMany({ where: { programmeId } });
    let wi = 0;
    for (const date of dates) {
      const day = await tx.vocabProgrammeDay.create({
        data: { programmeId, date, status: "SCHEDULED" },
      });
      const itemIds: string[] = [];
      for (let i = 0; i < programme.dailyTarget; i++) {
        itemIds.push(words[wi % words.length].id);
        wi += 1;
      }
      // Deduplicate within a day while keeping order
      const seen = new Set<string>();
      let sortOrder = 0;
      for (const vocabularyWordId of itemIds) {
        if (seen.has(vocabularyWordId)) continue;
        seen.add(vocabularyWordId);
        await tx.vocabProgrammeItem.create({
          data: { dayId: day.id, vocabularyWordId, sortOrder },
        });
        sortOrder += 1;
      }
    }
  });

  return getProgramme(programmeId);
}

export async function replaceDayWords(
  dayId: string,
  vocabularyWordIds: string[]
) {
  const day = await prisma.vocabProgrammeDay.findUnique({
    where: { id: dayId },
    include: { programme: true },
  });
  if (!day) throw new AppError("Programme day not found", 404);
  if (day.programme.status === "COMPLETED" || day.programme.status === "CANCELLED") {
    throw new AppError("Cannot edit a completed/cancelled programme", 400);
  }
  const unique = [...new Set(vocabularyWordIds.filter(Boolean))];
  if (!unique.length) throw new AppError("At least one word required", 400);

  const ok = await prisma.vocabularyWord.count({
    where: {
      id: { in: unique },
      isActive: true,
      category: { group: { level: { gradeId: day.programme.gradeId } } },
    },
  });
  if (ok !== unique.length) {
    throw new AppError("All words must be active and belong to the programme grade", 400);
  }

  const previous = await prisma.vocabProgrammeItem.findMany({
    where: { dayId },
    select: { vocabularyWordId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.vocabProgrammeItem.deleteMany({ where: { dayId } });
    for (let i = 0; i < unique.length; i++) {
      await tx.vocabProgrammeItem.create({
        data: { dayId, vocabularyWordId: unique[i], sortOrder: i },
      });
    }
  });

  // Keep student visibility aligned: unpublished days stay hidden; published days stay visible.
  if (day.status === "PUBLISHED") {
    await prisma.vocabularyWord.updateMany({
      where: { id: { in: unique } },
      data: { isActive: true },
    });
  } else if (day.programme.status === "ACTIVE") {
    await prisma.vocabularyWord.updateMany({
      where: { id: { in: unique } },
      data: { isActive: false },
    });
    // Words removed from this day may become visible again if not still scheduled elsewhere.
    const removed = previous
      .map((p) => p.vocabularyWordId)
      .filter((id) => !unique.includes(id));
    for (const wordId of removed) {
      const stillScheduled = await prisma.vocabProgrammeItem.findFirst({
        where: {
          vocabularyWordId: wordId,
          day: {
            status: "SCHEDULED",
            programme: { status: "ACTIVE" },
          },
        },
      });
      if (!stillScheduled) {
        await prisma.vocabularyWord.update({
          where: { id: wordId },
          data: { isActive: true },
        });
      }
    }
  }

  return getProgramme(day.programmeId);
}

export async function approveProgramme(id: string, adminId: string) {
  const programme = await prisma.vocabProgramme.findUnique({
    where: { id },
    include: { _count: { select: { days: true } } },
  });
  if (!programme) throw new AppError("Programme not found", 404);
  if (programme.status !== "DRAFT") {
    throw new AppError("Only DRAFT programmes can be approved", 400);
  }
  if (programme._count.days < 1) {
    throw new AppError("Generate the schedule before approving", 400);
  }
  return prisma.vocabProgramme.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: adminId,
      approvedAt: new Date(),
    },
    include: programmeInclude,
  });
}

/**
 * Marks programme ACTIVE, hides future scheduled words from students,
 * and enqueues DB-backed publish jobs. Does NOT auto-activate a next programme.
 * Day statuses stay SCHEDULED until the Kolkata publisher runs.
 */
export async function activateProgramme(id: string, adminId: string) {
  const programme = await prisma.vocabProgramme.findUnique({
    where: { id },
    include: { _count: { select: { days: true } } },
  });
  if (!programme) throw new AppError("Programme not found", 404);
  if (programme.status !== "APPROVED") {
    throw new AppError("Approve the programme before activating", 400);
  }
  if (programme._count.days < 1) {
    throw new AppError("Generate the schedule before activating", 400);
  }

  // Only one ACTIVE programme per grade — do not auto-chain the next six months.
  const otherActive = await prisma.vocabProgramme.findFirst({
    where: {
      gradeId: programme.gradeId,
      status: "ACTIVE",
      id: { not: id },
    },
  });
  if (otherActive) {
    throw new AppError(
      "This grade already has an ACTIVE programme. Complete or cancel it before activating another.",
      409
    );
  }

  const updated = await prisma.vocabProgramme.update({
    where: { id },
    data: {
      status: "ACTIVE",
      activatedById: adminId,
      activatedAt: new Date(),
    },
    include: programmeInclude,
  });

  await hideFutureProgrammeWords(id);
  await enqueuePublishJobsForProgramme(id);
  return updated;
}
