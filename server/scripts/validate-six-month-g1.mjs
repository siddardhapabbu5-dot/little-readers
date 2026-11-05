/**
 * Create (or reuse) a DRAFT 180-day GRADE_1 programme, generate schedule, analyze coverage.
 * Does not approve/activate. Does not invent vocabulary. Leaves DRAFT for admin review.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const grade = await p.learningGrade.findFirst({ where: { code: "GRADE_1" } });
if (!grade) throw new Error("GRADE_1 missing");

const activeWords = await p.vocabularyWord.findMany({
  where: {
    isActive: true,
    category: { group: { level: { gradeId: grade.id } } },
  },
  select: { id: true, text: true },
  orderBy: { text: "asc" },
});

const admin = await p.user.findFirst({
  where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
});
if (!admin) throw new Error("No admin");

const start = new Date();
start.setUTCHours(0, 0, 0, 0);
const end = new Date(start.getTime() + 179 * 86400000);

const title = `Audit six-month GRADE_1 ${start.toISOString().slice(0, 10)}`;
let prog = await p.vocabProgramme.findFirst({
  where: { title, gradeId: grade.id },
});
if (!prog) {
  prog = await p.vocabProgramme.create({
    data: {
      title,
      gradeId: grade.id,
      startDate: start,
      endDate: end,
      dailyTarget: 1,
      timezone: "Asia/Kolkata",
      status: "DRAFT",
      createdById: admin.id,
    },
  });
}

// Generate using service logic inline (same as generateProgrammeSchedule)
const words = activeWords;
if (!words.length) throw new Error("No active GRADE_1 words");

await p.vocabProgrammeDay.deleteMany({ where: { programmeId: prog.id } });
const dates = [];
for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
  dates.push(new Date(t));
}
let wi = 0;
for (const date of dates) {
  const day = await p.vocabProgrammeDay.create({
    data: { programmeId: prog.id, date, status: "SCHEDULED" },
  });
  const itemIds = [];
  for (let i = 0; i < prog.dailyTarget; i++) {
    itemIds.push(words[wi % words.length].id);
    wi += 1;
  }
  const seen = new Set();
  let sortOrder = 0;
  for (const vocabularyWordId of itemIds) {
    if (seen.has(vocabularyWordId)) continue;
    seen.add(vocabularyWordId);
    await p.vocabProgrammeItem.create({
      data: { dayId: day.id, vocabularyWordId, sortOrder },
    });
    sortOrder += 1;
  }
}

const days = await p.vocabProgrammeDay.findMany({
  where: { programmeId: prog.id },
  include: { items: { include: { vocabularyWord: { select: { text: true } } } } },
  orderBy: { date: "asc" },
});

const freq = new Map();
let underfilled = 0;
for (const d of days) {
  if (d.items.length < prog.dailyTarget) underfilled += 1;
  for (const it of d.items) {
    freq.set(it.vocabularyWord.text, (freq.get(it.vocabularyWord.text) || 0) + 1);
  }
}
const repeats = [...freq.entries()]
  .filter(([, c]) => c > 1)
  .sort((a, b) => b[1] - a[1]);

const result = {
  programmeId: prog.id,
  title: prog.title,
  status: prog.status,
  dailyTarget: prog.dailyTarget,
  dayCount: days.length,
  activePoolSize: words.length,
  underfilledDays: underfilled,
  uniqueWordsScheduled: freq.size,
  repeatedWordCount: repeats.length,
  maxRepeats: repeats[0]?.[1] ?? 0,
  topRepeats: repeats.slice(0, 15).map(([text, count]) => ({ text, count })),
  repeatReason:
    words.length < days.length * prog.dailyTarget
      ? `Round-robin: pool ${words.length} < ${days.length}×${prog.dailyTarget} slots, so each word appears ~${Math.ceil(days.length / Math.max(1, words.length))} times.`
      : "No forced reuse expected.",
  dailyTargetUnchanged: prog.dailyTarget === 1,
  note: "Left as DRAFT — not auto-approved. No vocabulary invented.",
};

console.log(JSON.stringify(result, null, 2));
await p.$disconnect();
