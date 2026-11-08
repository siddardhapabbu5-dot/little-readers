import { prisma } from "../src/lib/prisma.js";

async function main() {
  const [email, name, levelCode] = process.argv.slice(2);
  if (!email || !name || !levelCode) {
    throw new Error("Usage: move-child-level.ts <parentEmail> <childName> <LEVEL_CODE>");
  }
  const level = await prisma.learningLevel.findUniqueOrThrow({ where: { code: levelCode } });
  const res = await prisma.child.updateMany({
    where: { displayName: name, isActive: true, parent: { email } },
    data: { levelId: level.id },
  });
  console.log(`Moved ${res.count} child(ren) named ${name} to ${levelCode}.`);
}

main().finally(() => prisma.$disconnect());
