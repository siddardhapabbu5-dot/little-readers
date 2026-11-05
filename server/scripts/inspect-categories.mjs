import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const cats = await p.learningCategory.findMany({
  orderBy: [{ label: "asc" }, { createdAt: "asc" }],
  include: {
    group: { include: { level: { include: { grade: true } } } },
    _count: { select: { words: true } },
  },
});

console.log("total categories", cats.length);
const byLabel = new Map();
for (const c of cats) {
  const k = c.label;
  if (!byLabel.has(k)) byLabel.set(k, []);
  byLabel.get(k).push(c);
}
for (const [label, rows] of [...byLabel.entries()].sort()) {
  console.log(`\n${label} x${rows.length}`);
  for (const c of rows) {
    const g = c.group;
    const lvl = g?.level;
    console.log(
      " ",
      [
        c.code,
        "group=" + (g?.code ?? "-"),
        "level=" + (lvl?.code ?? "-"),
        "grade=" + (lvl?.grade?.code ?? "-"),
        c.isPublished ? "pub" : "unpub",
        "words=" + c._count.words,
        c.id.slice(0, 12),
      ].join(" | ")
    );
  }
}

const levels = await p.learningLevel.findMany({
  include: { grade: true, _count: { select: { groups: true } } },
  orderBy: { sortOrder: "asc" },
});
console.log("\nlevels:");
for (const l of levels) {
  console.log(
    " ",
    l.code,
    "grade=" + (l.grade?.code ?? "-"),
    "groups=" + l._count.groups,
    l.label
  );
}

const groups = await p.learningGroup.findMany({
  include: { level: true, _count: { select: { categories: true } } },
  orderBy: { sortOrder: "asc" },
});
console.log("\ngroups:", groups.length);
for (const g of groups) {
  console.log(
    " ",
    g.level.code + "/" + g.code,
    "cats=" + g._count.categories,
    g.label
  );
}

await p.$disconnect();
