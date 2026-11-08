import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, SoftButton } from "../../components/ui";
import {
  BadgeChip,
  DailyGoalCard,
  IconButton,
  KidsHeader,
  RewardBanner,
  SectionRow,
} from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { getActiveChild } from "../../services/secure";
import { displayEmoji } from "../../services/emoji";
import { colors, radii, shadow } from "../../theme";

type ProgressData = {
  child?: { displayName: string };
  summary?: {
    wordsAttempted?: number;
    wordsCorrect?: number;
    wordsNeedingPractice?: number;
    accuracy?: number;
    activitiesCompleted?: number;
    wordsLearned?: number;
    points?: number;
    stars?: number;
    categoriesCompleted?: number;
    daily?: {
      wordsLearnedToday: number;
      target: number;
      completed: boolean;
      date?: string;
      timezone?: string;
    };
    weekly?: { wordsLearned: number };
  };
  levels?: Array<{
    code: string;
    label: string;
    wordsLearned: number;
    categoriesCompleted: number;
    categoriesTouched: number;
  }>;
  categories?: Array<{
    categoryId: string;
    label: string;
    emoji: string;
    wordsLearned: number;
    wordCount: number;
    progressPct: number;
    completed: boolean;
    stars: number;
  }>;
  weakWords?: Array<{
    wordId: string;
    text: string;
    emoji: string;
    categoryLabel: string;
  }>;
  history?: Array<{
    sessionId: string;
    activityType: string;
    category: { label: string; emoji: string };
    accuracy: number;
    correctAnswers: number;
    incorrectAnswers: number;
    status: string;
    completedAt?: string | null;
    startedAt: string;
    stars: number;
    points: number;
  }>;
  achievements?: Array<{
    code: string;
    title: string;
    emoji?: string;
    unlocked: boolean;
    earnedAt?: string | null;
  }>;
  categoryBadges?: Array<{
    categoryId: string;
    label: string;
    emoji: string;
    badge: boolean;
    certificateId: string | null;
  }>;
  certificates?: Array<{
    id: string;
    certificateNo: string | null;
    title: string;
    issuedAt: string;
  }>;
  dailyChallenge?: { completedToday: boolean; totalCompleted: number };
};

export default function RewardsTab() {
  const router = useRouter();
  const [data, setData] = useState<ProgressData | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        try {
          const child = await getActiveChild<{ id: string; displayName: string }>();
          if (!child) {
            setError("Select a child from Home or Learn first.");
            setData(null);
            setChildId(null);
            return;
          }
          setChildId(child.id);
          const payload = await apiRequest<ProgressData>(
            `/learning/progress/${child.id}`
          );
          setData(payload);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load progress");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const s = data?.summary;
  const daily = s?.daily;
  const unlocked = (data?.achievements ?? []).filter((a) => a.unlocked).slice(0, 6);
  const locked = (data?.achievements ?? []).filter((a) => !a.unlocked).slice(0, 4);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.push("/(tabs)/home")} />}
          right={
            <View style={styles.pointsPill}>
              <Text style={styles.pointsText}>{s?.points ?? 0} pts</Text>
            </View>
          }
        />

        <RewardBanner
          title={`Progress for ${data?.child?.displayName ?? "you"}`}
          body="Stars and points come only from completed learning — nothing invented here."
          emoji="📊"
        />

        <ErrorText>{error}</ErrorText>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}

        {!loading && data ? (
          <>
            <DailyGoalCard
              completed={daily?.wordsLearnedToday ?? 0}
              target={daily?.target ?? 5}
              message={
                daily?.completed
                  ? `Daily goal done (${daily.timezone ?? "IST"}).`
                  : `Correct words today · ${daily?.date ?? "today"} IST`
              }
            />

            <View style={[styles.rowCard, shadow.soft, styles.challengeCard]}>
              <Text style={styles.rowTitle}>
                📅 Daily Challenge {data.dailyChallenge?.completedToday ? "✅" : ""}
              </Text>
              <Text style={styles.rowMeta}>
                {data.dailyChallenge?.completedToday
                  ? "Done for today. A new mix comes tomorrow!"
                  : "Today's challenge is waiting in Games → Fun Worlds."}{" "}
                Finished {data.dailyChallenge?.totalCompleted ?? 0} so far.
              </Text>
            </View>

            <SectionRow title="Badge collection ⭐" />
            <View style={styles.badgeGrid}>
              {(data.categoryBadges ?? []).map((b) => (
                <View
                  key={b.categoryId}
                  style={[styles.badge, shadow.soft, !b.badge && styles.badgeLocked]}
                >
                  <Text style={styles.badgeEmoji}>
                    {b.badge ? displayEmoji(b.emoji) : "🔒"}
                    {b.certificateId ? "🎓" : ""}
                  </Text>
                  <Text style={styles.badgeLabel} numberOfLines={2}>
                    {b.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.empty}>
              Finish a topic to earn its badge. Learn every word to earn the 🎓 certificate.
            </Text>

            <SectionRow title="My certificates 🎓" />
            {(data.certificates ?? []).length === 0 ? (
              <Text style={styles.empty}>
                No certificates yet. Learn all the words in a topic to earn one!
              </Text>
            ) : (
              (data.certificates ?? []).map((c) => (
                <View key={c.id} style={[styles.rowCard, shadow.soft]}>
                  <Text style={styles.rowTitle}>🎓 {c.title}</Text>
                  <Text style={styles.rowMeta}>
                    {c.certificateNo} · {formatWhen(c.issuedAt)}
                  </Text>
                  <SoftButton
                    label="View, download or share"
                    onPress={() => router.push({ pathname: "/certificate", params: { id: c.id } })}
                  />
                </View>
              ))
            )}

            <View style={[styles.stats, shadow.card]}>
              <Stat label="Words tried" value={String(s?.wordsAttempted ?? 0)} />
              <Stat label="Words correct" value={String(s?.wordsCorrect ?? 0)} />
              <Stat
                label="Need practice"
                value={String(s?.wordsNeedingPractice ?? 0)}
              />
              <Stat label="Accuracy" value={`${s?.accuracy ?? 0}%`} />
              <Stat label="Activities done" value={String(s?.activitiesCompleted ?? 0)} />
              <Stat label="Stars" value={String(s?.stars ?? 0)} />
              <Stat label="Categories done" value={String(s?.categoriesCompleted ?? 0)} />
              <Stat
                label="This week"
                value={String(s?.weekly?.wordsLearned ?? 0)}
              />
            </View>

            <SectionRow title="Levels" />
            {(data.levels ?? []).length === 0 ? (
              <Text style={styles.empty}>No level progress yet — play an activity.</Text>
            ) : (
              (data.levels ?? []).map((lvl) => (
                <View key={lvl.code} style={[styles.rowCard, shadow.soft]}>
                  <Text style={styles.rowTitle}>{lvl.label}</Text>
                  <Text style={styles.rowMeta}>
                    {lvl.wordsLearned} words · {lvl.categoriesCompleted} categories done ·{" "}
                    {lvl.categoriesTouched} started
                  </Text>
                </View>
              ))
            )}

            <SectionRow title="Categories" />
            {(data.categories ?? []).slice(0, 6).map((c) => (
              <View key={c.categoryId} style={[styles.rowCard, shadow.soft]}>
                <Text style={styles.rowTitle}>
                  {c.emoji} {c.label}
                  {c.completed ? " ✓" : ""}
                </Text>
                <Text style={styles.rowMeta}>
                  {c.wordsLearned}/{c.wordCount || "?"} words · {c.progressPct}% · ⭐{" "}
                  {c.stars}
                </Text>
              </View>
            ))}
            {(data.categories ?? []).length === 0 ? (
              <Text style={styles.empty}>Category progress appears after you play.</Text>
            ) : null}

            <SectionRow
              title="Needs practice"
              action="Revise"
              onAction={() => router.push("/(tabs)/games")}
            />
            {(data.weakWords ?? []).length === 0 ? (
              <Text style={styles.empty}>
                No weak words yet. Incorrect answers will show here for Revision.
              </Text>
            ) : (
              <View style={styles.chipRow}>
                {(data.weakWords ?? []).slice(0, 8).map((w) => (
                  <View key={w.wordId} style={styles.weakChip}>
                    <Text style={styles.weakText}>
                      {w.emoji} {w.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <SectionRow
              title="Recent activity"
              action="See all"
              onAction={() =>
                childId
                  ? router.push({
                      pathname: "/learning-history",
                      params: { childId },
                    })
                  : undefined
              }
            />
            {(data.history ?? []).slice(0, 4).map((h) => (
              <View key={h.sessionId} style={[styles.rowCard, shadow.soft]}>
                <Text style={styles.rowTitle}>
                  {h.category.emoji} {h.category.label} · {formatActivity(h.activityType)}
                </Text>
                <Text style={styles.rowMeta}>
                  {h.correctAnswers} correct · {h.incorrectAnswers} incorrect ·{" "}
                  {h.accuracy}% · {h.status === "COMPLETED" ? "Done" : h.status}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatWhen(h.completedAt ?? h.startedAt)} · ⭐ {h.stars} · {h.points}{" "}
                  pts
                </Text>
              </View>
            ))}
            {(data.history ?? []).length === 0 ? (
              <Text style={styles.empty}>No sessions yet.</Text>
            ) : null}

            <SectionRow
              title="Achievements"
              action="See all"
              onAction={() => router.push("/rewards-all")}
            />
            {unlocked.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {unlocked.map((a) => (
                  <BadgeChip
                    key={a.code}
                    emoji={a.emoji ?? "🏅"}
                    title={a.title}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.empty}>Keep playing to unlock achievements.</Text>
            )}
            {locked.length ? (
              <View style={styles.lockedBox}>
                <Text style={styles.lockedTitle}>Still locked</Text>
                {locked.map((a) => (
                  <Text key={a.code} style={styles.lockedItem}>
                    🔒 {a.title}
                  </Text>
                ))}
              </View>
            ) : null}

            <SoftButton
              label="Open Games"
              onPress={() => router.push("/(tabs)/games")}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatActivity(t: string) {
  switch (t) {
    case "LISTEN_SPELL":
      return "Listen & Spell";
    case "MATCHING":
      return "Matching";
    case "QUIZ":
      return "Quiz";
    case "REVISION":
      return "Revision";
    case "LISTEN":
      return "Listen";
    case "SPELL":
      return "Spell";
    case "DAILY_CHALLENGE":
      return "Daily Challenge";
    case "REVISION_WORLD":
      return "Revision World";
    case "MIXED":
      return "Mixed Games";
    default:
      return t;
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 36 },
  pointsPill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pointsText: { fontWeight: "800", color: colors.primaryDark },
  stats: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stat: {
    width: "47%",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 10,
    gap: 2,
  },
  statValue: { fontWeight: "900", fontSize: 18, color: colors.primaryDark },
  statLabel: { fontWeight: "700", fontSize: 11, color: colors.textMuted },
  rowCard: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    gap: 4,
  },
  rowTitle: { fontWeight: "800", color: colors.text, fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  empty: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weakChip: {
    backgroundColor: colors.yellowSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weakText: { fontWeight: "700", color: colors.text, fontSize: 12 },
  lockedBox: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    gap: 4,
  },
  lockedTitle: { fontWeight: "800", color: colors.textMuted, marginBottom: 4 },
  lockedItem: { color: colors.textMuted, fontWeight: "600" },
  challengeCard: { backgroundColor: colors.yellowSoft },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  badgeLocked: { backgroundColor: colors.bgSoft, opacity: 0.7 },
  badgeEmoji: { fontSize: 28 },
  badgeLabel: { fontWeight: "700", fontSize: 11, color: colors.text, textAlign: "center" },
});
