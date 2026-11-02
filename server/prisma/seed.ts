import {
  ConsentType,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Little Readers Phase 1 data…");

  const ageGroups = [
    {
      code: "FOUNDATION",
      label: "Foundation",
      ageMin: 3,
      ageMax: 5,
      description: "Alphabet, phonics, pictures and listen & repeat",
    },
    {
      code: "ELEMENTARY",
      label: "Elementary",
      ageMin: 6,
      ageMax: 8,
      description: "Word reading, spelling, sentences and listening",
    },
    {
      code: "ADVANCED",
      label: "Advanced",
      ageMin: 9,
      ageMax: 12,
      description: "Paragraphs, comprehension, grammar and pronunciation",
    },
  ];

  for (const group of ageGroups) {
    await prisma.ageGroup.upsert({
      where: { code: group.code },
      update: group,
      create: group,
    });
  }

  const levels = [
    { code: "FOUNDATION", label: "Foundation", sortOrder: 1 },
    { code: "ELEMENTARY", label: "Elementary", sortOrder: 2 },
    { code: "ADVANCED", label: "Advanced", sortOrder: 3 },
  ];

  for (const level of levels) {
    await prisma.learningLevel.upsert({
      where: { code: level.code },
      update: level,
      create: level,
    });
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

  const passwordHash = await bcrypt.hash("ParentDemo1", 12);
  const parent = await prisma.user.upsert({
    where: { email: "parent@littlereaders.test" },
    update: {
      name: "Demo Parent",
      passwordHash,
      role: UserRole.PARENT,
      isActive: true,
    },
    create: {
      name: "Demo Parent",
      email: "parent@littlereaders.test",
      passwordHash,
      role: UserRole.PARENT,
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

  const adminHash = await bcrypt.hash("AdminDemo1", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@littlereaders.test" },
    update: {
      name: "Demo Admin",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
    },
    create: {
      name: "Demo Admin",
      email: "admin@littlereaders.test",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
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
  }

  console.log("Seed complete.");
  console.log("Demo parent: parent@littlereaders.test / ParentDemo1");
  console.log("Demo admin:  admin@littlereaders.test / AdminDemo1");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
