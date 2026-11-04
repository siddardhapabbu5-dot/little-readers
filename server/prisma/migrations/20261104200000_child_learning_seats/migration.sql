-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "includedSeats" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Subscription" ADD COLUMN "extraSeats" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Child" ADD COLUMN "hasLearningSeat" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: assign learning seats to oldest active children up to each parent's capacity.
WITH ranked AS (
  SELECT
    c.id AS child_id,
    c."parentId",
    ROW_NUMBER() OVER (PARTITION BY c."parentId" ORDER BY c."createdAt" ASC) AS rn,
    COALESCE(s."includedSeats", 2) + COALESCE(s."extraSeats", 0) AS capacity
  FROM "Child" c
  LEFT JOIN LATERAL (
    SELECT "includedSeats", "extraSeats"
    FROM "Subscription"
    WHERE "userId" = c."parentId"
    ORDER BY "createdAt" DESC
    LIMIT 1
  ) s ON true
  WHERE c."isActive" = true
)
UPDATE "Child" ch
SET "hasLearningSeat" = true
FROM ranked r
WHERE ch.id = r.child_id
  AND r.rn <= GREATEST(r.capacity, 0);
