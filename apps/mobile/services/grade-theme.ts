import type { SpeakProfile } from "./speech";

/**
 * Child-facing look per Learn Wise grade. Grade 1 (live) has no entry and keeps the existing UI.
 * Grade 2 = ages 4–6 (playful), Grade 3 = 7–9 (explorer), Grade 4 = 10–12 (calm study).
 */
export type GradeTheme = {
  levelCode: "LEVEL_2" | "LEVEL_3" | "LEVEL_4";
  name: string;
  bannerTitle: string;
  bannerBody: string;
  bannerEmoji: string;
  bannerColor: string;
  accent: string;
  accentSoft: string;
  cardColor: string;
  titleSize: number;
  symbolSize: number;
  /** Grade 2 shows big symbols and short text; older grades show the conversation line on each card. */
  showConversationOnCard: boolean;
  voice: SpeakProfile;
  topicWord: string;
  playLabel: string;
};

const THEMES: Record<GradeTheme["levelCode"], GradeTheme> = {
  LEVEL_2: {
    levelCode: "LEVEL_2",
    name: "Playground",
    bannerTitle: "Let's talk and play!",
    bannerBody: "Pick a picture, listen, then say it with me.",
    bannerEmoji: "🎈",
    bannerColor: "#FFE8A3",
    accent: "#FF8A3D",
    accentSoft: "#FFF1E3",
    cardColor: "#FFFFFF",
    titleSize: 18,
    symbolSize: 54,
    showConversationOnCard: false,
    voice: "kid",
    topicWord: "Topic",
    playLabel: "Play word games",
  },
  LEVEL_3: {
    levelCode: "LEVEL_3",
    name: "Explorer",
    bannerTitle: "Explore English",
    bannerBody: "Read the conversation, try the example, then play to collect stars.",
    bannerEmoji: "🧭",
    bannerColor: "#C9F2EC",
    accent: "#0F9F8F",
    accentSoft: "#E3F8F5",
    cardColor: "#FFFFFF",
    titleSize: 16,
    symbolSize: 40,
    showConversationOnCard: true,
    voice: "default",
    topicWord: "Topic",
    playLabel: "Practice words",
  },
  LEVEL_4: {
    levelCode: "LEVEL_4",
    name: "Studio",
    bannerTitle: "Build your English skills",
    bannerBody: "Study each topic, practise the key words and track your progress.",
    bannerEmoji: "🎓",
    bannerColor: "#DDE3FF",
    accent: "#4F46E5",
    accentSoft: "#EEF0FF",
    cardColor: "#FFFFFF",
    titleSize: 15,
    symbolSize: 32,
    showConversationOnCard: true,
    voice: "default",
    topicWord: "Lesson topic",
    playLabel: "Practise vocabulary",
  },
};

export function gradeTheme(levelCode: string | null | undefined): GradeTheme | null {
  return levelCode && levelCode in THEMES ? THEMES[levelCode as GradeTheme["levelCode"]] : null;
}
