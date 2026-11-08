import { prisma } from "../src/lib/prisma.js";

async function main() {
  const levels = await prisma.learningLevel.findMany({
    orderBy: { code: "asc" },
    include: {
      groups: {
        include: {
          categories: {
            include: { _count: { select: { words: { where: { isActive: true } } } } },
          },
        },
      },
    },
  });
  for (const level of levels) {
    const cats = level.groups.flatMap((g) => g.categories);
    const published = cats.filter((c) => c.isPublished);
    const playable = published.filter((c) => c._count.words > 0);
    const words = playable.reduce((n, c) => n + c._count.words, 0);
    console.log(
      `${level.code}: categories ${cats.length}, published ${published.length}, playable ${playable.length}, words ${words}`
    );
  }
  const kids = await prisma.child.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: { level: true, parent: { select: { email: true } } },
  });
  console.log("Most recently updated children:");
  for (const k of kids) {
    console.log(
      ` - ${k.displayName} (${k.parent.email}) level=${k.level?.code ?? "none"} seat=${k.hasLearningSeat}`
    );
  }
}

main().finally(() => prisma.$disconnect());
