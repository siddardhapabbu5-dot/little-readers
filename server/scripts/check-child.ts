import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { email: "siddardhapabbu5@gmail.com" },
  include: { children: true },
});

console.log(
  JSON.stringify(
    user
      ? {
          email: user.email,
          children: user.children.map((c) => ({
            id: c.id,
            name: c.displayName,
            year: c.birthYear,
            active: c.isActive,
          })),
        }
      : null,
    null,
    2
  )
);

await prisma.$disconnect();
