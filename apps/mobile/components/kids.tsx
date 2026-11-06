import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, shadow } from "../theme";
import { ProgressBar } from "./ui";

export function KidsHeader({
  left,
  right,
  title,
}: {
  left?: ReactNode;
  right?: ReactNode;
  title?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      {title ? <Text style={styles.headerTitle}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={[styles.headerSide, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function IconButton({
  emoji,
  onPress,
  bg = "#fff",
}: {
  emoji: string;
  onPress?: () => void;
  bg?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.iconBtn, { backgroundColor: bg }, shadow.soft]}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
    </Pressable>
  );
}

export function WelcomeHero({
  name,
  message = "Ready to learn something awesome today?",
  character = "🧒",
}: {
  name: string;
  message?: string;
  character?: string;
}) {
  return (
    <View style={styles.welcome}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.hi}>
          Hi, {name}! 👋
        </Text>
        <Text style={styles.welcomeMsg}>{message}</Text>
      </View>
      <View style={styles.characterBubble}>
        <Text style={{ fontSize: 44 }}>{character}</Text>
      </View>
    </View>
  );
}

export function QuickCategoryGrid({
  items,
  onPress,
}: {
  items: Array<{ emoji: string; label: string; tint: string; key: string }>;
  onPress: (key: string) => void;
}) {
  return (
    <View style={styles.quickGrid}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onPress(item.key)}
          style={[styles.quickItem, { backgroundColor: item.tint }, shadow.soft]}
        >
          <Text style={{ fontSize: 30 }}>{item.emoji}</Text>
          <Text style={styles.quickLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DailyGoalCard({
  completed,
  target,
  message = "Keep it up! You're doing great.",
}: {
  completed: number;
  target: number;
  message?: string;
}) {
  return (
    <View style={[styles.goalCard, shadow.card]}>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={styles.goalEyebrow}>Daily Goal</Text>
        <Text style={styles.goalTitle}>
          {Math.min(completed, target)}/{target} Words today
        </Text>
        <ProgressBar value={completed} max={target} color="#FFD56A" />
        <Text style={styles.goalMsg}>{message}</Text>
      </View>
      <Text style={{ fontSize: 64 }}>🌟</Text>
    </View>
  );
}

export function ContinueCard({
  emoji,
  title,
  subtitle,
  progressPct,
  onContinue,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  progressPct: number;
  onContinue: () => void;
}) {
  return (
    <View style={[styles.continueCard, shadow.card]}>
      <View style={[styles.continueIcon, { backgroundColor: colors.accentSoft }]}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.continueTitle}>{title}</Text>
        <Text style={styles.continueSub}>{subtitle}</Text>
        <ProgressBar value={progressPct} max={100} />
        <Text style={styles.pct}>{progressPct}%</Text>
      </View>
      <Pressable onPress={onContinue} style={styles.playBtn}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>▶</Text>
      </Pressable>
    </View>
  );
}

export function RecommendCard({
  emoji,
  title,
  tag,
  tint,
  onPress,
}: {
  emoji: string;
  title: string;
  tag: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.recommend, { backgroundColor: tint }, shadow.soft]}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <Text style={styles.recommendTag}>{tag}</Text>
      <Text style={styles.recommendTitle}>{title}</Text>
    </Pressable>
  );
}

export function LearningBanner({
  title,
  body,
  emoji = "👾",
  color = colors.bannerTeal,
}: {
  title: string;
  body: string;
  emoji?: string;
  color?: string;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: color }, shadow.soft]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <Text style={{ fontSize: 56 }}>{emoji}</Text>
    </View>
  );
}

export function FilterPills({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {options.map((opt) => {
        const on = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.pill, on ? styles.pillOn : null]}
          >
            <Text style={[styles.pillText, on ? styles.pillTextOn : null]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CategoryCard({
  emoji,
  title,
  description,
  learned,
  total,
  locked,
  onPress,
}: {
  emoji: string;
  title: string;
  description: string;
  learned: number;
  total: number;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={locked}
      onPress={onPress}
      style={[styles.catCard, shadow.card, locked ? { opacity: 0.45 } : null]}
    >
      <View style={[styles.catIcon, { backgroundColor: colors.skySoft }]}>
        <Text style={{ fontSize: 28 }}>{locked ? "🔒" : emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.catTitle}>{title}</Text>
        <Text style={styles.catDesc} numberOfLines={1}>
          {description}
        </Text>
        <ProgressBar value={learned} max={Math.max(total, 1)} />
        <Text style={styles.catMeta}>
          {learned}/{total} words
        </Text>
      </View>
      <View style={styles.arrowBtn}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>›</Text>
      </View>
    </Pressable>
  );
}

export function RewardBanner({
  title,
  body,
  emoji = "🏆",
}: {
  title: string;
  body: string;
  emoji?: string;
}) {
  return (
    <View style={[styles.rewardBanner, shadow.card]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.rewardTitle}>{title}</Text>
        <Text style={styles.rewardBody}>{body}</Text>
      </View>
      <Text style={{ fontSize: 56 }}>{emoji}</Text>
    </View>
  );
}

export function ProgressStats({
  lessons,
  streak,
  badges,
}: {
  lessons: number;
  streak: number;
  badges: number;
}) {
  return (
    <View style={[styles.statsCard, shadow.card]}>
      <Text style={styles.statsHeading}>Your Progress</Text>
      <View style={styles.statsRow}>
        <Stat emoji="📘" label="Lessons Completed" value={lessons} />
        <Stat emoji="🔥" label="Current Streak" value={streak} />
        <Stat emoji="🏅" label="Badges Earned" value={badges} />
      </View>
    </View>
  );
}

function Stat({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function BadgeChip({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={[styles.badge, shadow.soft]}>
      <View style={styles.badgeIcon}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <Text style={styles.badgeTitle}>{title}</Text>
    </View>
  );
}

export function WeeklyChallengeCard({
  title,
  completed,
  target,
}: {
  title: string;
  completed: number;
  target: number;
}) {
  return (
    <View style={[styles.challenge, shadow.card]}>
      <Text style={{ fontSize: 42 }}>🎁</Text>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.challengeTitle}>Weekly Challenge</Text>
        <Text style={styles.challengeBody}>{title}</Text>
        <ProgressBar value={completed} max={target} color={colors.mint} />
        <Text style={styles.catMeta}>
          {Math.min(completed, target)}/{target}
        </Text>
      </View>
      <Text style={{ fontSize: 40 }}>👾</Text>
    </View>
  );
}

export function SectionRow({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerSide: { width: 84, flexDirection: "row", gap: 8 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  welcome: { flexDirection: "row", alignItems: "center", gap: 12 },
  hi: { fontSize: 28, fontWeight: "800", color: colors.text },
  welcomeMsg: { fontSize: 15, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  characterBubble: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: colors.yellowSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  quickItem: {
    width: "22%",
    minWidth: 70,
    flexGrow: 1,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
  },
  quickLabel: { fontWeight: "700", color: colors.text, fontSize: 12 },
  goalCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalEyebrow: { color: "#EDE9FE", fontWeight: "700" },
  goalTitle: { color: "#fff", fontSize: 24, fontWeight: "800" },
  goalMsg: { color: "#EDE9FE", fontWeight: "600", marginTop: 2 },
  continueCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  continueIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  continueTitle: { fontWeight: "800", fontSize: 16, color: colors.text },
  continueSub: { color: colors.textMuted, fontSize: 12, marginBottom: 2 },
  pct: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  recommend: {
    width: 150,
    borderRadius: radii.xl,
    padding: 14,
    gap: 6,
  },
  recommendTag: { color: colors.textMuted, fontWeight: "700", fontSize: 11 },
  recommendTitle: { fontWeight: "800", color: colors.text, fontSize: 15 },
  banner: {
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerTitle: { fontSize: 22, fontWeight: "800", color: "#134E4A" },
  bannerBody: { color: "#115E59", fontWeight: "600" },
  pills: { gap: 8, paddingVertical: 2 },
  pill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontWeight: "700", color: colors.textMuted },
  pillTextOn: { color: "#fff" },
  catCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  catIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: { fontWeight: "800", fontSize: 16, color: colors.text },
  catDesc: { color: colors.textMuted, fontSize: 12 },
  catMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardBanner: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  rewardTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  rewardBody: { color: "#EDE9FE", fontWeight: "600", lineHeight: 20 },
  statsCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    gap: 12,
  },
  statsHeading: { fontWeight: "800", fontSize: 17, color: colors.text },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontWeight: "800", fontSize: 22, color: colors.text },
  statLabel: { color: colors.textMuted, fontSize: 11, textAlign: "center", fontWeight: "600" },
  badge: {
    width: 108,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.yellowSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTitle: { fontWeight: "700", textAlign: "center", color: colors.text, fontSize: 12 },
  challenge: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  challengeTitle: { fontWeight: "800", fontSize: 16, color: colors.text },
  challengeBody: { color: colors.textMuted, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  sectionAction: { color: colors.primary, fontWeight: "700" },
});
