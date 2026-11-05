import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const lessons = await p.lesson.findMany({
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    title: true,
    status: true,
    isPublished: true,
    isActive: true,
    createdAt: true,
    learningCategory: { select: { code: true, label: true } },
    group: { select: { code: true } },
    _count: { select: { vocabItems: true } },
  },
});

console.log("total lessons:", lessons.length);
const testLike = lessons.filter(
  (l) =>
    /^B\d+\s+Lesson\s+\d+/i.test(l.title) ||
    /^Lesson\s+\d{10,}$/i.test(l.title) ||
    /^Play Lesson\s+\d+/i.test(l.title) ||
    /test/i.test(l.title)
);
console.log("test-like titles:", testLike.length);

const titleCounts = new Map();
for (const l of lessons) {
  titleCounts.set(l.title, (titleCounts.get(l.title) || 0) + 1);
}
const dups = [...titleCounts.entries()]
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1]);
console.log("duplicate titles:", dups.length);
for (const [title, n] of dups.slice(0, 20)) {
  console.log(`  ${n}x  ${title}`);
}

console.log("\n--- recent / all ---");
for (const l of lessons) {
  console.log(
    [
      l.title,
      l.learningCategory?.code ?? "-",
      "vocab=" + l._count.vocabItems,
      l.isPublished ? "pub" : "draft",
      l.isActive ? "active" : "off",
      l.id.slice(0, 10),
    ].join(" | ")
  );
}

await p.$disconnect();
