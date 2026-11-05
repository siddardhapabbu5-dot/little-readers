/**
 * Clear demo/sample operational data so Admin + Parent UIs look empty/fresh.
 * Keeps academic structure + real vocabulary curriculum.
 * Keeps demo login users (parent/admin/superadmin @littlereaders.test).
 *
 *   node ./scripts/clear-sample-data.mjs
 *   RESTORE_DEMO_SUB=1 node ./scripts/clear-sample-data.mjs   # empty parent seat, no kids
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const restoreDemoSub = process.env.RESTORE_DEMO_SUB !== "0";

async function main() {
  const keepEmails = [
    "parent@littlereaders.test",
    "admin@littlereaders.test",
    "superadmin@littlereaders.test",
  ];

  const demoParents = await prisma.user.findMany({
    where: {
      role: "PARENT",
      OR: [
        { email: { endsWith: "@littlereaders.test" } },
        { email: { endsWith: ".test" } },
      ],
    },
    select: { id: true, email: true },
  });
  const parentIds = demoParents.map((p) => p.id);

  const children = await prisma.child.findMany({
    where: { parentId: { in: parentIds } },
    select: { id: true, displayName: true },
  });
  const childIds = children.map((c) => c.id);
  console.log(
    `Removing ${childIds.length} demo children:`,
    children.map((c) => c.displayName).join(", ") || "(none)"
  );

  if (childIds.length) {
    // Delete dependents that may not cascade from Child in all envs
    await prisma.learningAttempt.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.childCategoryProgress.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.childLessonProgress.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.achievement.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.reward.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.certificate.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.speechAssessment.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.learningProgress.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.deviceTransferEvent.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.studentDevice.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.classroomEnrollment.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    await prisma.learningSession.deleteMany({ where: { childId: { in: childIds } } }).catch(() => {});
    const del = await prisma.child.deleteMany({ where: { id: { in: childIds } } });
    console.log(`Deleted children: ${del.count}`);
  }

  // Seed sample lessons + tiny Word rows
  const seedLessonIds = ["seed_lesson_alphabet_az", "seed_lesson_phonics_sounds"];
  await prisma.lessonWord.deleteMany({ where: { lessonId: { in: seedLessonIds } } }).catch(() => {});
  const lessons = await prisma.lesson.deleteMany({ where: { id: { in: seedLessonIds } } });
  console.log(`Deleted seed lessons: ${lessons.count}`);

  const sampleTexts = ["cat", "dog", "sun", "ball", "book"];
  await prisma.lessonWord
    .deleteMany({ where: { word: { text: { in: sampleTexts } } } })
    .catch(() => {});
  const words = await prisma.word.deleteMany({ where: { text: { in: sampleTexts } } }).catch(() => ({ count: 0 }));
  console.log(`Deleted sample Word rows: ${words.count ?? 0}`);

  // Demo schools / staff noise
  const demoSchools = await prisma.school.findMany({
    where: {
      OR: [
        { name: { contains: "Demo" } },
        { name: { contains: "Test" } },
        { name: { contains: "Sample" } },
      ],
    },
    select: { id: true },
  });
  if (demoSchools.length) {
    const ids = demoSchools.map((s) => s.id);
    await prisma.classroomEnrollment.deleteMany({ where: { classroom: { schoolId: { in: ids } } } }).catch(() => {});
    await prisma.schoolStaff.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => {});
    await prisma.classroom.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => {});
    const s = await prisma.school.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted demo schools: ${s.count}`);
  } else {
    console.log("Deleted demo schools: 0");
  }

  // Payments for .test users
  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@littlereaders.test" } },
        { email: { endsWith: ".test" } },
      ],
    },
    select: { id: true },
  });
  const testIds = testUsers.map((u) => u.id);
  if (testIds.length) {
    const pay = await prisma.payment.deleteMany({ where: { userId: { in: testIds } } }).catch(() => ({ count: 0 }));
    console.log(`Deleted demo payments: ${pay.count ?? 0}`);
  }

  const now = new Date();
  const cancelled = await prisma.subscription.updateMany({
    where: {
      userId: { in: parentIds },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      expiresAt: now,
      graceEndsAt: null,
    },
  });
  console.log(`Cancelled demo parent subscriptions: ${cancelled.count}`);

  // Keep only the three known demo accounts active
  await prisma.user.updateMany({
    where: { email: { in: keepEmails } },
    data: { isActive: true },
  });
  const extra = await prisma.user.updateMany({
    where: {
      email: { endsWith: ".test" },
      NOT: { email: { in: keepEmails } },
    },
    data: { isActive: false },
  });
  console.log(`Deactivated extra .test users: ${extra.count}`);

  if (restoreDemoSub) {
    const parent = await prisma.user.findUnique({
      where: { email: "parent@littlereaders.test" },
    });
    if (parent) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await prisma.subscription.create({
        data: {
          userId: parent.id,
          plan: "YEARLY",
          status: "ACTIVE",
          startedAt: now,
          expiresAt,
          provider: "manual_seed",
          providerRef: `seed_demo_parent_yearly_${Date.now()}`,
          includedSeats: 2,
          extraSeats: 0,
        },
      });
      console.log("Restored empty demo parent subscription (0 children, 2 seats)");
    }
  }

  const parent = await prisma.user.findUnique({
    where: { email: "parent@littlereaders.test" },
    include: {
      children: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const lessonCount = await prisma.lesson.count();
  const activeParents = await prisma.user.count({
    where: { role: "PARENT", isActive: true },
  });
  const schoolCount = await prisma.school.count();
  console.log({
    parentChildren: parent?.children?.length ?? 0,
    parentSub: parent?.subscriptions?.[0]?.status ?? null,
    activeParents,
    lessons: lessonCount,
    schools: schoolCount,
  });
  console.log("Done. Reload Admin/Parent screens (pull to refresh).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
