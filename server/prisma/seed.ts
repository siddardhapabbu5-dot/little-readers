import {
  ConsentType,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedLevel1Vocabulary } from "./seeds/level1-vocabulary.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Little Readers Phase 1 data…");

  const ageGroups = [
    {
      code: "LEVEL_1",
      label: "Grade 1",
      ageMin: 1,
      ageMax: 3,
      description: "Ages 1–3 — Grade 1 vocabulary band",
    },
    {
      code: "LEVEL_2",
      label: "Grade 2",
      ageMin: 4,
      ageMax: 6,
      description: "Ages 4–6 — Grade 2 vocabulary band",
    },
    {
      code: "LEVEL_3",
      label: "Grade 3",
      ageMin: 7,
      ageMax: 9,
      description: "Ages 7–9 — Grade 3 vocabulary band",
    },
    {
      code: "LEVEL_4",
      label: "Grade 4",
      ageMin: 10,
      ageMax: 12,
      description: "Ages 10–12 — Grade 4 vocabulary band",
    },
    {
      code: "FOUNDATION",
      label: "Foundation",
      ageMin: 3,
      ageMax: 5,
      description: "Legacy placement band",
    },
    {
      code: "ELEMENTARY",
      label: "Elementary",
      ageMin: 6,
      ageMax: 8,
      description: "Legacy placement band",
    },
    {
      code: "ADVANCED",
      label: "Advanced",
      ageMin: 9,
      ageMax: 12,
      description: "Legacy placement band",
    },
  ];

  for (const group of ageGroups) {
    await prisma.ageGroup.upsert({
      where: { code: group.code },
      update: group,
      create: group,
    });
  }

  // Default grades/levels/categories for local tests. Client DBs: SEED_CURRICULUM=0
  // so `db:seed` does not recreate GRADE_2–4 after a wipe.
  const seedCurriculum = process.env.SEED_CURRICULUM !== "0";

  if (seedCurriculum) {
    const grades = [
      { code: "GRADE_1", label: "Grade 1", ageMin: 1, ageMax: 3, sortOrder: 1 },
      { code: "GRADE_2", label: "Grade 2", ageMin: 4, ageMax: 6, sortOrder: 2 },
      { code: "GRADE_3", label: "Grade 3", ageMin: 7, ageMax: 9, sortOrder: 3 },
      { code: "GRADE_4", label: "Grade 4", ageMin: 10, ageMax: 12, sortOrder: 4 },
    ];
    for (const g of grades) {
      await prisma.learningGrade.upsert({
        where: { code: g.code },
        update: g,
        create: g,
      });
    }

    const gradeByCode = Object.fromEntries(
      (
        await prisma.learningGrade.findMany({
          where: { code: { in: grades.map((g) => g.code) } },
        })
      ).map((g) => [g.code, g.id])
    );

    const levels = [
      {
        code: "LEVEL_1",
        label: "Level 1 – Ages 1–3 (Grade 1)",
        sortOrder: 0,
        ageMin: 1,
        ageMax: 3,
        kind: "GRADE_BAND" as const,
        gradeId: gradeByCode.GRADE_1,
        description:
          "Grade 1 age band — vocabulary via dictionary approval or category import",
      },
      {
        code: "LEVEL_2",
        label: "Level 2 – Ages 4–6 (Grade 2)",
        sortOrder: 1,
        ageMin: 4,
        ageMax: 6,
        kind: "GRADE_BAND" as const,
        gradeId: gradeByCode.GRADE_2,
        description: "Grade 2 age band — vocabulary via dictionary approval",
      },
      {
        code: "LEVEL_3",
        label: "Level 3 – Ages 7–9 (Grade 3)",
        sortOrder: 2,
        ageMin: 7,
        ageMax: 9,
        kind: "GRADE_BAND" as const,
        gradeId: gradeByCode.GRADE_3,
        description: "Grade 3 age band — vocabulary via dictionary approval",
      },
      {
        code: "LEVEL_4",
        label: "Level 4 – Ages 10–12 (Grade 4)",
        sortOrder: 3,
        ageMin: 10,
        ageMax: 12,
        kind: "GRADE_BAND" as const,
        gradeId: gradeByCode.GRADE_4,
        description: "Grade 4 age band — vocabulary via dictionary approval",
      },
      {
        code: "FOUNDATION",
        label: "Foundation",
        sortOrder: 10,
        ageMin: 3,
        ageMax: 5,
      },
      {
        code: "ELEMENTARY",
        label: "Elementary",
        sortOrder: 11,
        ageMin: 6,
        ageMax: 8,
      },
      {
        code: "ADVANCED",
        label: "Advanced",
        sortOrder: 12,
        ageMin: 9,
        ageMax: 12,
      },
    ];

    for (const level of levels) {
      await prisma.learningLevel.upsert({
        where: { code: level.code },
        update: level,
        create: level,
      });
    }

    // Categories/groups for Grades 1–4 — do not seed English vocabulary words.
    await seedLevel1Vocabulary(prisma, { includeWords: false });
  } else {
    console.log("Skipping default grades/levels/categories (SEED_CURRICULUM=0).");
  }

  const subjects = [
    { code: "ALPHABET", name: "Alphabet Learning" },
    { code: "PHONICS", name: "Phonics Learning" },
    { code: "VOCABULARY", name: "Vocabulary" },
    { code: "READING", name: "Reading" },
    { code: "SPELLING", name: "Spelling" },
    { code: "SPEECH", name: "Speech & Pronunciation" },
    { code: "GRAMMAR", name: "Grammar" },
    { code: "LISTENING", name: "Listening Practice" },
    { code: "STORIES", name: "Animated Stories" },
    { code: "QUIZZES", name: "Quizzes" },
  ];

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: subject,
      create: subject,
    });
  }

  const permissions = [
    { code: "lessons.manage", description: "Create and edit lessons" },
    { code: "users.manage", description: "Manage parent accounts" },
    { code: "content.publish", description: "Publish learning content" },
    { code: "subscriptions.view", description: "View subscription reports" },
    { code: "reports.export", description: "Export analytics reports" },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: permission,
      create: permission,
    });
  }

  const contentAdminRole = await prisma.adminRole.upsert({
    where: { name: "Content Admin" },
    update: { description: "Manages learning content" },
    create: {
      name: "Content Admin",
      description: "Manages learning content",
    },
  });

  const manageLessons = await prisma.permission.findUniqueOrThrow({
    where: { code: "lessons.manage" },
  });
  const publishContent = await prisma.permission.findUniqueOrThrow({
    where: { code: "content.publish" },
  });

  for (const permissionId of [manageLessons.id, publishContent.id]) {
    await prisma.rolePermission.upsert({
      where: {
        adminRoleId_permissionId: {
          adminRoleId: contentAdminRole.id,
          permissionId,
        },
      },
      update: {},
      create: {
        adminRoleId: contentAdminRole.id,
        permissionId,
      },
    });
  }

  // Demo accounts, sample lessons, free yearly seat — local/tests only.
  // Client / fresh DB: SEED_DEMO=0
  const seedDemo = process.env.SEED_DEMO !== "0";

  if (!seedDemo) {
    console.log(
      "Seed complete (structure only — SEED_DEMO=0, no demo users, sample lessons, or free trials)."
    );
    return;
  }

  const foundation = await prisma.ageGroup.findUniqueOrThrow({
    where: { code: "FOUNDATION" },
  });
  const foundationLevel = await prisma.learningLevel.findUniqueOrThrow({
    where: { code: "FOUNDATION" },
  });
  const alphabetSubject = await prisma.subject.findUniqueOrThrow({
    where: { code: "ALPHABET" },
  });
  const phonicsSubject = await prisma.subject.findUniqueOrThrow({
    where: { code: "PHONICS" },
  });

  const alphabetLesson = await prisma.lesson.upsert({
    where: { id: "seed_lesson_alphabet_az" },
    update: {
      title: "Alphabet A–Z",
      description: "Learn letter names and shapes from A to Z.",
      category: "ALPHABET",
      difficulty: 1,
      isPublished: true,
      status: "PUBLISHED",
      instructions: "Tap each letter, listen, and say it out loud.",
      subjectId: alphabetSubject.id,
      ageGroupId: foundation.id,
      levelId: foundationLevel.id,
    },
    create: {
      id: "seed_lesson_alphabet_az",
      title: "Alphabet A–Z",
      description: "Learn letter names and shapes from A to Z.",
      category: "ALPHABET",
      difficulty: 1,
      isPublished: true,
      status: "PUBLISHED",
      instructions: "Tap each letter, listen, and say it out loud.",
      subjectId: alphabetSubject.id,
      ageGroupId: foundation.id,
      levelId: foundationLevel.id,
    },
  });

  await prisma.lesson.upsert({
    where: { id: "seed_lesson_phonics_sounds" },
    update: {
      title: "Letter Sounds",
      description: "Practice common alphabet sounds.",
      category: "PHONICS",
      difficulty: 1,
      isPublished: true,
      status: "PUBLISHED",
      subjectId: phonicsSubject.id,
      ageGroupId: foundation.id,
      levelId: foundationLevel.id,
    },
    create: {
      id: "seed_lesson_phonics_sounds",
      title: "Letter Sounds",
      description: "Practice common alphabet sounds.",
      category: "PHONICS",
      difficulty: 1,
      isPublished: true,
      status: "PUBLISHED",
      subjectId: phonicsSubject.id,
      ageGroupId: foundation.id,
      levelId: foundationLevel.id,
    },
  });

  const sampleWords = [
    { text: "cat", phonetic: "kæt", definition: "A small furry pet", difficulty: 1 },
    { text: "dog", phonetic: "dɒɡ", definition: "A friendly animal", difficulty: 1 },
    { text: "sun", phonetic: "sʌn", definition: "The bright star in the sky", difficulty: 1 },
    { text: "ball", phonetic: "bɔːl", definition: "A round toy", difficulty: 1 },
    { text: "book", phonetic: "bʊk", definition: "Pages you can read", difficulty: 1 },
  ];

  for (const word of sampleWords) {
    const saved = await prisma.word.upsert({
      where: { text: word.text },
      update: word,
      create: { ...word, ageMin: 3, ageMax: 8 },
    });

    await prisma.lessonWord.upsert({
      where: {
        lessonId_wordId: {
          lessonId: alphabetLesson.id,
          wordId: saved.id,
        },
      },
      update: {},
      create: {
        lessonId: alphabetLesson.id,
        wordId: saved.id,
      },
    });
  }

  const phonics = [
    { grapheme: "a", phoneme: "/æ/", exampleWord: "apple", sortOrder: 1 },
    { grapheme: "b", phoneme: "/b/", exampleWord: "ball", sortOrder: 2 },
    { grapheme: "c", phoneme: "/k/", exampleWord: "cat", sortOrder: 3 },
    { grapheme: "s", phoneme: "/s/", exampleWord: "sun", sortOrder: 4 },
  ];

  for (const item of phonics) {
    await prisma.phonic.upsert({
      where: {
        grapheme_phoneme: {
          grapheme: item.grapheme,
          phoneme: item.phoneme,
        },
      },
      update: item,
      create: item,
    });
  }

  const passwordHash = await bcrypt.hash("ParentDemo1", 12);
  const parent = await prisma.user.upsert({
    where: { email: "parent@littlereaders.test" },
    update: {
      name: "Demo Parent",
      passwordHash,
      role: UserRole.PARENT,
      isActive: true,
      mobileE164: "+919876543210",
    },
    create: {
      name: "Demo Parent",
      email: "parent@littlereaders.test",
      passwordHash,
      role: UserRole.PARENT,
      mobileE164: "+919876543210",
    },
  });

  for (const consentType of [
    ConsentType.TERMS,
    ConsentType.PRIVACY,
    ConsentType.PARENTAL,
  ]) {
    const existing = await prisma.parentalConsent.findFirst({
      where: { userId: parent.id, consentType, version: "1.0" },
    });
    if (!existing) {
      await prisma.parentalConsent.create({
        data: {
          userId: parent.id,
          consentType,
          version: "1.0",
        },
      });
    }
  }

  const existingSub = await prisma.subscription.findFirst({
    where: { userId: parent.id, providerRef: "seed_demo_parent_yearly" },
  });
  if (!existingSub) {
    const startedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await prisma.subscription.create({
      data: {
        userId: parent.id,
        plan: "YEARLY",
        status: "ACTIVE",
        startedAt,
        expiresAt,
        provider: "manual_seed",
        providerRef: "seed_demo_parent_yearly",
        includedSeats: 2,
        extraSeats: 0,
      },
    });
  } else {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: "ACTIVE",
        expiresAt,
        cancelledAt: null,
        includedSeats: 2,
      },
    });
  }

  const adminHash = await bcrypt.hash("AdminDemo1", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@littlereaders.test" },
    update: {
      name: "Demo Admin",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      name: "Demo Admin",
      email: "admin@littlereaders.test",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const superHash = await bcrypt.hash("SuperDemo1", 12);
  await prisma.user.upsert({
    where: { email: "superadmin@littlereaders.test" },
    update: {
      name: "Demo Super Admin",
      passwordHash: superHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name: "Demo Super Admin",
      email: "superadmin@littlereaders.test",
      passwordHash: superHash,
      role: UserRole.SUPER_ADMIN,
    },
  });

  await prisma.adminRoleBinding.upsert({
    where: {
      userId_adminRoleId: {
        userId: admin.id,
        adminRoleId: contentAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      adminRoleId: contentAdminRole.id,
    },
  });

  const existingChild = await prisma.child.findFirst({
    where: { parentId: parent.id, displayName: "Ava" },
  });

  if (!existingChild) {
    const child = await prisma.child.create({
      data: {
        parentId: parent.id,
        displayName: "Ava",
        birthYear: new Date().getFullYear() - 5,
        levelId: foundationLevel.id,
        ageGroupId: foundation.id,
        hasLearningSeat: true,
      },
    });
    await prisma.learningProgress.create({
      data: {
        childId: child.id,
        wordsLearned: 5,
        readingScore: 72,
        spellingScore: 65,
        minutesLearned: 40,
      },
    });
  } else if (!existingChild.hasLearningSeat) {
    await prisma.child.update({
      where: { id: existingChild.id },
      data: { hasLearningSeat: true },
    });
  }

  console.log("Seed complete.");
  console.log("Demo parent:      parent@littlereaders.test / ParentDemo1");
  console.log("Demo admin:       admin@littlereaders.test / AdminDemo1");
  console.log("Demo super admin: superadmin@littlereaders.test / SuperDemo1");
  console.log("Note: TEACHER/STUDENT User roles are deferred (Child profiles = student learning identity).");
  console.log("Client handoff: run `npm run db:prepare-client --workspace=@little-readers/server` and seed with SEED_DEMO=0.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
