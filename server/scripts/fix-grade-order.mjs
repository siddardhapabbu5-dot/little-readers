import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function gradeSortKey(code) {
  const m = String(code).match(/(\d+)/);
  return m ? Number(m[1]) : 999;
}

const grades = await p.learningGrade.findMany();
console.log(
  "before:",
  grades
    .map((g) => `${g.code} sort=${g.sortOrder} active=${g.isActive}`)
    .join(", ")
);

for (const g of grades) {
  const sortOrder = gradeSortKey(g.code);
  await p.learningGrade.update({
    where: { id: g.id },
    data: { sortOrder },
  });
}

const after = await p.learningGrade.findMany({
  orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
});
console.log(
  "after:",
  after.map((g) => `${g.code} sort=${g.sortOrder}`).join(", ")
);

await p.$disconnect();
