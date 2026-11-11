/**
 * Remove automated-test lesson leftovers (B8 Lesson 1793…, Play Lesson …, etc.).
 * Keeps seeded curriculum lessons (Alphabet A–Z, Letter Sounds, …).
 *
 * Usage: node ./scripts/clean-test-lessons.mjs
 */
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/destructive-guard.mjs";

assertDestructiveAllowed("clean-test-lessons");

const p = new PrismaClient();

function isTestLessonTitle(title) {
  return (
    /^B\d+\s+Lesson\s+\d+/i.test(title) ||
    /^Lesson\s+\d{10,}$/i.test(title) ||
    /^Play Lesson\s+\d+/i.test(title) ||
    /^Batch\s*\d+/i.test(title)
  );
}

async function deleteLessonCascade(lessonId) {
  await p.classroomLessonAssignment.deleteMany({ where: { lessonId } });
  await p.childLessonProgress.deleteMany({ where: { lessonId } });
  // Sessions may have question attempts — delete attempts via sessions first
  const sessions = await p.learningSession.findMany({
    where: { lessonId },
    select: { id: true },
  });
  if (sessions.length) {
    await p.questionAttempt.deleteMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    });
  }
  await p.learningSession.deleteMany({ where: { lessonId } });
  await p.learningAttempt.deleteMany({ where: { lessonId } });
  await p.lessonVocabItem.deleteMany({ where: { lessonId } });
  await p.lessonWord.deleteMany({ where: { lessonId } });
  await p.quiz.updateMany({ where: { lessonId }, data: { lessonId: null } });
  await p.story.updateMany({ where: { lessonId }, data: { lessonId: null } });
  await p.mediaAsset.updateMany({
    where: { lessonId },
    data: { lessonId: null },
  });
  await p.lesson.delete({ where: { id: lessonId } });
}

async function main() {
  const lessons = await p.lesson.findMany({
    select: { id: true, title: true, isPublished: true },
  });
  const doomed = lessons.filter((l) => isTestLessonTitle(l.title));
  console.log(`Found ${doomed.length} test lessons of ${lessons.length} total`);

  for (const l of doomed) {
    await deleteLessonCascade(l.id);
    console.log("deleted:", l.title);
  }

  // Orphan test vocabulary words created by Batch 8 / play tests
  const testWords = await p.vocabularyWord.findMany({
    where: {
      OR: [
        { text: { startsWith: "b8w" } },
        { text: { startsWith: "playfix_" } },
        { text: { startsWith: "w_" } },
      ],
    },
    select: { id: true, text: true },
  });
  // Only delete clearly stamped test words
  const wordDoomed = testWords.filter(
    (w) =>
      /^b8w\d+/i.test(w.text) ||
      /^playfix_/i.test(w.text) ||
      /^w_\d+_/i.test(w.text)
  );
  if (wordDoomed.length) {
    await p.lessonVocabItem.deleteMany({
      where: { vocabularyWordId: { in: wordDoomed.map((w) => w.id) } },
    });
    await p.questionAttempt.deleteMany({
      where: { wordId: { in: wordDoomed.map((w) => w.id) } },
    });
    const del = await p.vocabularyWord.deleteMany({
      where: { id: { in: wordDoomed.map((w) => w.id) } },
    });
    console.log("deleted test words:", del.count);
  }

  const remaining = await p.lesson.findMany({
    select: { title: true, isPublished: true, isActive: true },
    orderBy: { title: "asc" },
  });
  console.log("\nRemaining lessons:");
  for (const l of remaining) {
    console.log(
      `  ${l.title} (${l.isPublished ? "pub" : "draft"}, ${l.isActive ? "active" : "off"})`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
