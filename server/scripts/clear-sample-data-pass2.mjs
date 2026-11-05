/**
 * Second pass: empty Admin dashboard noise (extra parents, all current schools,
 * leftover payments/subs) while keeping curriculum + 3 demo logins.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEEP = [
  "parent@littlereaders.test",
  "admin@littlereaders.test",
  "superadmin@littlereaders.test",
];

async function main() {
  // Deactivate every parent except the demo parent
  const parentsOff = await prisma.user.updateMany({
    where: {
      role: "PARENT",
      NOT: { email: "parent@littlereaders.test" },
    },
    data: { isActive: false },
  });
  console.log("Deactivated other parents:", parentsOff.count);

  // Soft-clear remaining children on inactive parents
  const inactiveParents = await prisma.user.findMany({
    where: { role: "PARENT", isActive: false },
    select: { id: true },
  });
  const ids = inactiveParents.map((p) => p.id);
  if (ids.length) {
    const kids = await prisma.child.updateMany({
      where: { parentId: { in: ids }, isActive: true },
      data: { isActive: false, hasLearningSeat: false },
    });
    console.log("Deactivated children of inactive parents:", kids.count);
  }

  // Remove all schools (local env is test noise; client can recreate)
  const schoolIds = (await prisma.school.findMany({ select: { id: true } })).map(
    (s) => s.id
  );
  if (schoolIds.length) {
    await prisma.classroomEnrollment
      .deleteMany({ where: { classroom: { schoolId: { in: schoolIds } } } })
      .catch(() => {});
    await prisma.schoolStaff.deleteMany({ where: { schoolId: { in: schoolIds } } }).catch(() => {});
    await prisma.classroom.deleteMany({ where: { schoolId: { in: schoolIds } } }).catch(() => {});
    const s = await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    console.log("Deleted schools:", s.count);
  } else {
    console.log("Deleted schools: 0");
  }

  // Wipe remaining payments (admin revenue charts)
  const pay = await prisma.payment.deleteMany({});
  console.log("Deleted all payments:", pay.count);

  // Cancel all subscriptions except the latest ACTIVE for demo parent
  const demoParent = await prisma.user.findUnique({
    where: { email: "parent@littlereaders.test" },
  });
  const now = new Date();
  if (demoParent) {
    await prisma.subscription.updateMany({
      where: {
        NOT: { userId: demoParent.id },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        expiresAt: now,
      },
    });
    // Keep only newest ACTIVE for demo parent; cancel older ones
    const subs = await prisma.subscription.findMany({
      where: { userId: demoParent.id },
      orderBy: { createdAt: "desc" },
    });
    for (let i = 0; i < subs.length; i += 1) {
      if (i === 0 && subs[i].status === "ACTIVE") continue;
      if (i === 0) {
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        await prisma.subscription.update({
          where: { id: subs[i].id },
          data: {
            status: "ACTIVE",
            expiresAt,
            cancelledAt: null,
            includedSeats: 2,
            extraSeats: 0,
          },
        });
        continue;
      }
      await prisma.subscription.update({
        where: { id: subs[i].id },
        data: { status: "CANCELLED", cancelledAt: now, expiresAt: now },
      });
    }
  }

  await prisma.user.updateMany({
    where: { email: { in: KEEP } },
    data: { isActive: true },
  });

  const snap = {
    activeParents: await prisma.user.count({
      where: { role: "PARENT", isActive: true },
    }),
    activeChildren: await prisma.child.count({ where: { isActive: true } }),
    schools: await prisma.school.count(),
    payments: await prisma.payment.count(),
    lessons: await prisma.lesson.count(),
    activeSubs: await prisma.subscription.count({ where: { status: "ACTIVE" } }),
  };
  console.log(snap);
  console.log("Admin/Parent should now look empty aside from curriculum counts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
