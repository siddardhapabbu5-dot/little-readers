import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, shadow } from "../theme";
import { art } from "./illustrations";
import { ProgressBar } from "./ui";

/** Bright sky backdrop used behind every student screen. */
export function SkyBackground({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sky, style]}>
      <LinearGradient
        colors={[colors.skyTop, colors.skyMid, colors.skyBottom]}
        locations={[0, 0.35, 0.8]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.cloud, { top: 40, left: -30, width: 140, height: 46 }]} />
      <View pointerEvents="none" style={[styles.cloud, { top: 110, right: -40, width: 170, height: 52 }]} />
      <View pointerEvents="none" style={[styles.cloud, { top: 230, left: 40, width: 90, height: 30, opacity: 0.5 }]} />
      {children}
    </View>
  );
}

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
      {title ? (
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={[styles.headerSide, { justifyContent: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function IconButton({
  emoji,
  onPress,
  bg = "#fff",
  label,
}: {
  emoji: string;
  onPress?: () => void;
  bg?: string;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? (emoji === "←" ? "Back" : undefined)}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, shadow.soft]}
    >
      <Text style={styles.iconBtnText}>{emoji}</Text>
    </Pressable>
  );
}

/** Big friendly call-to-action button. */
export function KidsButton({
  label,
  onPress,
  loading,
  disabled,
  tone = "purple",
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: "purple" | "orange" | "green" | "white";
  style?: StyleProp<ViewStyle>;
}) {
  const grad: Record<string, [string, string]> = {
    purple: [colors.primaryGradientEnd, colors.primary],
    orange: ["#FFC069", colors.orange],
    green: ["#5EE38A", colors.green],
    white: ["#FFFFFF", "#FFFFFF"],
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.kidsBtnWrap,
        shadow.card,
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      <LinearGradient colors={grad[tone]} style={styles.kidsBtn}>
        {loading ? (
          <ActivityIndicator color={tone === "white" ? colors.primary : "#fff"} />
        ) : (
          <Text style={[styles.kidsBtnText, tone === "white" && { color: colors.primaryDark }]}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function WelcomeHero({
  name,
  message = "Ready to learn something awesome today?",
  character = "🧒",
  image,
}: {
  name: string;
  message?: string;
  character?: string;
  image?: ImageSourcePropType;
}) {
  return (
    <View style={styles.welcome}>
      <View style={styles.avatar}>
        <Text style={{ fontSize: 30 }}>{character}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.hi} numberOfLines={1}>
          Hi, {name}!
        </Text>
        <Text style={styles.welcomeMsg} numberOfLines={2}>
          {message}
        </Text>
      </View>
      {image ? <Image source={image} style={styles.welcomeArt} resizeMode="contain" /> : null}
    </View>
  );
}

export function StatPill({
  emoji,
  value,
  label,
  tint = "#fff",
}: {
  emoji: string;
  value: string | number;
  label: string;
  tint?: string;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: tint }, shadow.soft]}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.statPillValue}>{value}</Text>
        <Text style={styles.statPillLabel} numberOfLines={1}>
          {label}
        </Text>
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
    <LinearGradient
      colors={[colors.primaryGradientEnd, colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.goalCard, shadow.card]}
    >
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={styles.goalEyebrow}>Daily Goal</Text>
        <Text style={styles.goalTitle}>
          {Math.min(completed, target)}/{target} words today
        </Text>
        <ProgressBar value={completed} max={target} color={colors.yellow} />
        <Text style={styles.goalMsg}>{message}</Text>
      </View>
      <Image source={art.starGoal} style={styles.goalArt} resizeMode="contain" />
    </LinearGradient>
  );
}

export function ContinueCard({
  emoji,
  title,
  subtitle,
  progressPct,
  onContinue,
  image,
  tint = colors.accentSoft,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  progressPct: number;
  onContinue: () => void;
  image?: ImageSourcePropType | null;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onContinue}
      accessibilityRole="button"
      accessibilityLabel={`Continue ${title}`}
      style={({ pressed }) => [styles.continueCard, shadow.card, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={[styles.continueIcon, { backgroundColor: tint }]}>
        {image ? (
          <Image source={image} style={styles.continueArt} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 34 }}>{emoji}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.continueTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.continueSub} numberOfLines={1}>
          {subtitle}
        </Text>
        <ProgressBar value={progressPct} max={100} />
        <Text style={styles.pct}>{progressPct}% done</Text>
      </View>
      <View style={styles.playBtn}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>▶</Text>
      </View>
    </Pressable>
  );
}

export function RecommendCard({
  emoji,
  title,
  tag,
  tint,
  onPress,
  image,
}: {
  emoji: string;
  title: string;
  tag: string;
  tint: string;
  onPress: () => void;
  image?: ImageSourcePropType | null;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.recommend, { backgroundColor: tint, opacity: pressed ? 0.88 : 1 }, shadow.soft]}
    >
      {image ? (
        <Image source={image} style={styles.recommendArt} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: 40 }}>{emoji}</Text>
      )}
      <Text style={styles.recommendTag}>{tag}</Text>
      <Text style={styles.recommendTitle} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

export function LearningBanner({
  title,
  body,
  emoji = "📚",
  color = colors.bannerTeal,
  image,
}: {
  title: string;
  body: string;
  emoji?: string;
  color?: string;
  image?: ImageSourcePropType | null;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: color }, shadow.soft]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      {image ? (
        <Image source={image} style={styles.bannerArt} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: 56 }}>{emoji}</Text>
      )}
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
  image,
  tint = colors.skySoft,
}: {
  emoji: string;
  title: string;
  description: string;
  learned: number;
  total: number;
  locked?: boolean;
  onPress: () => void;
  image?: ImageSourcePropType | null;
  tint?: string;
}) {
  return (
    <Pressable
      disabled={locked}
      onPress={onPress}
      style={[styles.catCard, shadow.card, locked ? { opacity: 0.5 } : null]}
    >
      <View style={[styles.catIcon, { backgroundColor: tint }]}>
        {locked ? (
          <Text style={{ fontSize: 28 }}>🔒</Text>
        ) : image ? (
          <Image source={image} style={styles.catIconArt} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 28 }}>{emoji}</Text>
        )}
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

/** Grid card for a vocabulary category: big picture, progress, stars, lock / done state. */
export function CategoryTile({
  emoji,
  title,
  learned,
  total,
  stars,
  locked,
  completed,
  comingSoon,
  image,
  tint,
  onPress,
}: {
  emoji: string;
  title: string;
  learned: number;
  total: number;
  stars: number;
  locked?: boolean;
  completed?: boolean;
  comingSoon?: boolean;
  image?: ImageSourcePropType | null;
  tint: string;
  onPress: () => void;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((learned / total) * 100)) : 0;
  const disabled = locked || comingSoon;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        comingSoon
          ? `${title}, words coming soon`
          : `${title}, ${learned} of ${total} words${locked ? ", locked" : completed ? ", completed" : ""}`
      }
      style={({ pressed }) => [
        styles.tile,
        shadow.card,
        { opacity: disabled ? 0.6 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={[styles.tileArtBox, { backgroundColor: tint }]}>
        {image ? (
          <Image source={image} style={styles.tileArt} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 56 }}>{emoji}</Text>
        )}
        {comingSoon ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>⏳</Text>
          </View>
        ) : locked ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>🔒</Text>
          </View>
        ) : completed ? (
          <View style={[styles.tileBadge, { backgroundColor: colors.green }]}>
            <Text style={[styles.tileBadgeText, { color: "#fff" }]}>✓</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        {comingSoon ? (
          <Text style={styles.tileMeta}>Words coming soon</Text>
        ) : (
          <>
            <ProgressBar value={learned} max={Math.max(total, 1)} color={completed ? colors.green : colors.primary} />
            <View style={styles.tileMetaRow}>
              <Text style={styles.tileMeta}>
                {learned}/{total} · {pct}%
              </Text>
              <Text style={styles.tileStars}>⭐ {stars}</Text>
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}

/** Illustrated shortcut card (Daily Challenge, Rewards, Certificates…). */
export function FeatureTile({
  title,
  subtitle,
  image,
  emoji,
  tint,
  onPress,
  disabled,
  wide,
}: {
  title: string;
  subtitle?: string;
  image?: ImageSourcePropType | null;
  emoji?: string;
  tint: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.feature,
        wide && styles.featureWide,
        { backgroundColor: tint, opacity: disabled ? 0.55 : pressed ? 0.9 : 1 },
        shadow.soft,
      ]}
    >
      {image ? (
        <Image source={image} style={wide ? styles.featureArtWide : styles.featureArt} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: wide ? 48 : 40 }}>{disabled ? "🔒" : emoji}</Text>
      )}
      <View style={wide ? { flex: 1, gap: 4 } : { gap: 2, alignItems: "center" }}>
        <Text style={[styles.featureTitle, !wide && { textAlign: "center" }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.featureSub, !wide && { textAlign: "center" }]} numberOfLines={wide ? 3 : 2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function RewardBanner({
  title,
  body,
  emoji = "🏆",
  image = art.trophy,
}: {
  title: string;
  body: string;
  emoji?: string;
  image?: ImageSourcePropType | null;
}) {
  return (
    <LinearGradient
      colors={[colors.primaryGradientEnd, colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.rewardBanner, shadow.card]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.rewardTitle}>{title}</Text>
        <Text style={styles.rewardBody}>{body}</Text>
      </View>
      {image ? (
        <Image source={image} style={styles.rewardArt} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: 56 }}>{emoji}</Text>
      )}
    </LinearGradient>
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
        <Stat emoji="📘" label="Lessons Completed" value={lessons} tint={colors.skySoft} />
        <Stat emoji="🔥" label="Current Streak" value={streak} tint={colors.orangeSoft} />
        <Stat emoji="🏅" label="Badges Earned" value={badges} tint={colors.yellowSoft} />
      </View>
    </View>
  );
}

function Stat({ emoji, label, value, tint }: { emoji: string; label: string; value: number; tint: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: tint }]}>
      <Text style={{ fontSize: 24 }}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function BadgeChip({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={[styles.badge, shadow.soft]}>
      <LinearGradient colors={["#FFE58A", colors.gold]} style={styles.badgeIcon}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </LinearGradient>
      <Text style={styles.badgeTitle} numberOfLines={2}>
        {title}
      </Text>
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
      <Image source={art.trophy} style={styles.challengeArt} resizeMode="contain" />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.challengeTitle}>Weekly Challenge</Text>
        <Text style={styles.challengeBody}>{title}</Text>
        <ProgressBar value={completed} max={target} color={colors.green} />
        <Text style={styles.catMeta}>
          {Math.min(completed, target)}/{target}
        </Text>
      </View>
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
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionActionPill}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { flex: 1, backgroundColor: colors.skyBottom, overflow: "hidden" },
  cloud: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 999,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    minHeight: 48,
  },
  headerSide: { minWidth: 50, flexDirection: "row", gap: 8, alignItems: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 6,
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { fontSize: 20, fontWeight: "800", color: colors.text },
  kidsBtnWrap: { borderRadius: radii.pill },
  kidsBtn: {
    borderRadius: radii.pill,
    minHeight: 56,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  kidsBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  welcome: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.yellowSoft,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  hi: { fontSize: 26, fontWeight: "900", color: colors.text },
  welcomeMsg: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: "700", opacity: 0.75 },
  welcomeArt: { width: 96, height: 72 },
  statPill: {
    flex: 1,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statPillValue: { fontSize: 18, fontWeight: "900", color: colors.text },
  statPillLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
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
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalEyebrow: { color: "#F3EEFF", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  goalTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  goalMsg: { color: "#F3EEFF", fontWeight: "700", marginTop: 2 },
  goalArt: { width: 92, height: 92 },
  continueCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  continueIcon: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  continueArt: { width: 64, height: 64 },
  continueTitle: { fontWeight: "900", fontSize: 18, color: colors.text },
  continueSub: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  pct: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  recommend: {
    width: 150,
    borderRadius: radii.xl,
    padding: 14,
    gap: 6,
  },
  recommendArt: { width: "100%", height: 84 },
  recommendTag: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  recommendTitle: { fontWeight: "900", color: colors.text, fontSize: 16 },
  banner: {
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerTitle: { fontSize: 22, fontWeight: "900", color: colors.text },
  bannerBody: { color: colors.textMuted, fontWeight: "700", lineHeight: 20 },
  bannerArt: { width: 96, height: 96 },
  pills: { gap: 8, paddingVertical: 2 },
  pill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 2,
    borderColor: "#fff",
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontWeight: "800", color: colors.textMuted, fontSize: 15 },
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
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  catIconArt: { width: 54, height: 54 },
  catTitle: { fontWeight: "900", fontSize: 17, color: colors.text },
  catDesc: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  catMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  arrowBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tile: {
    flexBasis: "46%",
    flexGrow: 1,
    maxWidth: "50%",
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  tileArtBox: { height: 118, alignItems: "center", justifyContent: "center" },
  tileArt: { width: "84%", height: 104 },
  tileBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { fontSize: 15, fontWeight: "900" },
  tileBody: { padding: 12, gap: 6 },
  tileTitle: { fontWeight: "900", fontSize: 16, color: colors.text, minHeight: 20 },
  tileMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tileMeta: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  tileStars: { color: colors.text, fontWeight: "900", fontSize: 12 },
  feature: {
    flexBasis: "30%",
    flexGrow: 1,
    borderRadius: radii.lg,
    padding: 12,
    alignItems: "center",
    gap: 6,
    minHeight: 132,
  },
  featureWide: {
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 0,
    padding: 14,
  },
  featureArt: { width: 64, height: 64 },
  featureArtWide: { width: 84, height: 84 },
  featureTitle: { fontWeight: "900", fontSize: 15, color: colors.text },
  featureSub: { color: colors.textMuted, fontWeight: "700", fontSize: 12, lineHeight: 17 },
  rewardBanner: {
    borderRadius: radii.xl,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  rewardBody: { color: "#F3EEFF", fontWeight: "700", lineHeight: 20 },
  rewardArt: { width: 96, height: 96 },
  statsCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    gap: 12,
  },
  statsHeading: { fontWeight: "900", fontSize: 18, color: colors.text },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 4, borderRadius: radii.md, paddingVertical: 12 },
  statValue: { fontWeight: "900", fontSize: 22, color: colors.text },
  statLabel: { color: colors.textMuted, fontSize: 11, textAlign: "center", fontWeight: "700" },
  badge: {
    width: 112,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTitle: { fontWeight: "800", textAlign: "center", color: colors.text, fontSize: 12 },
  challenge: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  challengeArt: { width: 72, height: 72 },
  challengeTitle: { fontWeight: "900", fontSize: 17, color: colors.text },
  challengeBody: { color: colors.textMuted, fontWeight: "700" },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 20, fontWeight: "900", color: colors.text },
  sectionActionPill: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sectionAction: { color: colors.primary, fontWeight: "800", fontSize: 13 },
});
