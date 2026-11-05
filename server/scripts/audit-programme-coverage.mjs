/**
 * Validate six-month / programme coverage. Read-only except optional inspect of latest programmes.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const grades = await p.learningGrade.findMany({
  where: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
  orderBy: { sortOrder: "asc" },
});

const out = { generatedAt: new Date().toISOString(), grades: [], programmes: [] };

for (const g of grades) {
  const active = await p.vocabularyWord.count({
    where: {
      isActive: true,
      category: { group: { level: { gradeId: g.id } } },
    },
  });
  const all = await p.vocabularyWord.count({
    where: { category: { group: { level: { gradeId: g.id } } } },
  });
  // Sufficient for ~180 days at dailyTarget 1 needs >= unique pool OR accepts repeats
  const sufficientFor180at1 = active >= 1; // can round-robin; flag thin pools
  out.grades.push({
    code: g.code,
    activeWords: active,
    allWords: all,
    thinPoolForSixMonth: active < 60,
    note:
      active < 60
        ? `Only ${active} active words — a 180-day dailyTarget=1 programme must repeat words (round-robin). Do not invent vocabulary.`
        : "Pool size supports low-repeat 180-day schedules at dailyTarget 1.",
  });
}

const programmes = await p.vocabProgramme.findMany({
  where: {
    grade: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
  },
  orderBy: { createdAt: "desc" },
  take: 20,
  include: {
    grade: { select: { code: true } },
    days: {
      include: {
        items: { include: { vocabularyWord: { select: { id: true, text: true, isActive: true } } } },
      },
      orderBy: { date: "asc" },
    },
    _count: { select: { days: true } },
  },
});

for (const prog of programmes) {
  const dayCount = prog.days.length;
  const target = prog.dailyTarget;
  const underfilled = [];
  const wordFreq = new Map();
  for (const day of prog.days) {
    const n = day.items.length;
    // After dedupe within a day, item count may be < dailyTarget when pool tiny
    if (n < 1) underfilled.push({ date: day.date, status: day.status, items: n });
    else if (n < target && day.items.length < target) {
      underfilled.push({
        date: day.date,
        status: day.status,
        items: n,
        expected: target,
        reason: "fewer unique words than dailyTarget after within-day dedupe",
      });
    }
    for (const it of day.items) {
      const t = it.vocabularyWord.text;
      wordFreq.set(t, (wordFreq.get(t) || 0) + 1);
    }
  }
  const repeats = [...wordFreq.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([text, count]) => ({ text, count }));

  const uniqueWords = wordFreq.size;
  out.programmes.push({
    id: prog.id,
    title: prog.title,
    grade: prog.grade.code,
    status: prog.status,
    dailyTarget: target,
    timezone: prog.timezone,
    startDate: prog.startDate,
    endDate: prog.endDate,
    dayCount,
    isSixMonthApprox: dayCount >= 170 && dayCount <= 186,
    underfilledDays: underfilled.length,
    underfilledSample: underfilled.slice(0, 10),
    uniqueWordsScheduled: uniqueWords,
    topRepeats: repeats,
    repeatReason:
      uniqueWords < dayCount * target
        ? "Round-robin over a smaller approved pool than days×dailyTarget; generator reuses words by design."
        : "Little or no forced reuse.",
  });
}

console.log(JSON.stringify(out, null, 2));
await p.$disconnect();
