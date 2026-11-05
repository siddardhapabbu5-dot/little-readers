import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const cats = await p.learningCategory.findMany({
  include: { _count: { select: { words: true } } },
});
const empty = cats.filter(
  (c) => c._count.words === 0 && c.code !== "FAMILY_AND_PEOPLE"
);
for (const c of empty) {
  await p.learningCategory.delete({ where: { id: c.id } });
}
console.log(
  "Deleted empty categories:",
  empty.map((c) => c.code)
);
console.log(
  "Left:",
  await p.learningCategory.findMany({
    select: { code: true, label: true, _count: { select: { words: true } } },
  })
);
await p.$disconnect();
