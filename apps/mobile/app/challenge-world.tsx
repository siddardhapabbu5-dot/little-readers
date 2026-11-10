import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ErrorText, ProgressBar } from "../components/ui";
import { IconButton, KidsHeader, SkyBackground } from "../components/kids";
import { art } from "../components/illustrations";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild } from "../services/secure";
import {
  MEDALS,
  formatCountdown,
  weekOf,
  type BoardEntry,
  type ChallengeHistory,
  type ChallengeOverview,
  type ChildClassroom,
  type FriendBoard,
  type GlobalBoard,
  type Winners,
} from "../services/challenges";
import { colors, radii, shadow } from "../theme";

type Tab = "week" | "global" | "friends" | "class" | "rewards";
const TABS: { key: Tab; label: string }[] = [
  { key: "week", label: "⭐ My Week" },
  { key: "global", label: "🌍 Global" },
  { key: "friends", label: "🤝 Friends" },
  { key: "class", label: "🏫 Class" },
  { key: "rewards", label: "🏆 Rewards" },
];

/** Challenge World: weekly goals, leaderboards and rewards for the active child. */
export default function ChallengeWorldScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? "week");
  const [child, setChild] = useState<{ id: string; displayName: string } | null>(null);
  const [overview, setOverview] = useState<ChallengeOverview | null>(null);
  const [global, setGlobal] = useState<GlobalBoard | null>(null);
  const [friends, setFriends] = useState<FriendBoard | null>(null);
  const [classroom, setClassroom] = useState<ChildClassroom | null>(null);
  const [history, setHistory] = useState<ChallengeHistory | null>(null);
  const [winners, setWinners] = useState<Winners | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const active = await getActiveChild<{ id: string; displayName: string }>();
          if (!active) {
            setError("Choose a student on the Parent page first.");
            return;
          }
          setChild(active);
          const q = `?childId=${encodeURIComponent(active.id)}`;
          const [ov, gl, fr, cl, hi, wi] = await Promise.all([
            apiRequest<ChallengeOverview>(`/challenges/overview${q}`),
            apiRequest<GlobalBoard>(`/challenges/global${q}`).catch(() => null),
            apiRequest<FriendBoard>(`/challenges/friends/leaderboard${q}`).catch(() => null),
            apiRequest<ChildClassroom>(`/challenges/classroom${q}`).catch(() => null),
            apiRequest<ChallengeHistory>(`/challenges/history${q}`).catch(() => null),
            apiRequest<Winners>("/challenges/winners").catch(() => null),
          ]);
          setOverview(ov);
          setGlobal(gl);
          setFriends(fr);
          setClassroom(cl);
          setHistory(hi);
          setWinners(wi);
          setNow(Date.now());
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load Challenge World");
        }
      })();
    }, [])
  );

  const endsIn = overview ? new Date(overview.endsAt).getTime() - now : 0;
  const tabs = TABS.filter(
    (t) =>
      !overview ||
      (t.key === "global" ? overview.features.global : true) &&
        (t.key === "friends" ? overview.features.friends : true) &&
        (t.key === "class" ? overview.features.classroom : true)
  );

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title="Challenge World"
        />
        <ScrollView contentContainerStyle={styles.content}>
          <ErrorText>{error}</ErrorText>
          {!overview && !error ? <ActivityIndicator color={colors.primary} /> : null}
          {overview ? (
            <>
              <LinearGradient colors={["#7B61FF", "#B06CFF", "#FF8A5B"]} style={[styles.hero, shadow.card]}>
                <Text style={styles.heroKicker}>
                  {child?.displayName ? `${child.displayName}'s week` : "This week"} · ends in{" "}
                  {formatCountdown(endsIn)}
                </Text>
                <View style={styles.heroRow}>
                  <Image source={art.trophy} style={styles.heroTrophy} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroPoints}>{overview.weekPoints}</Text>
                    <Text style={styles.heroLabel}>points this week</Text>
                  </View>
                  <View style={styles.heroSide}>
                    <Text style={styles.heroSideNum}>⭐ {overview.lifetimePoints}</Text>
                    <Text style={styles.heroSideLabel}>all-time</Text>
                    <Text style={styles.heroSideNum}>🏅 {overview.lifetimeBadges}</Text>
                    <Text style={styles.heroSideLabel}>badges</Text>
                  </View>
                </View>
                <Text style={styles.heroFoot}>
                  {overview.remainingGoals === 0
                    ? "Every goal done — what a week! 🌈"
                    : `${overview.remainingGoals} goal${overview.remainingGoals === 1 ? "" : "s"} left this week. You can do it!`}
                </Text>
              </LinearGradient>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {tabs.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={[styles.tab, tab === t.key && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {tab === "week" ? <WeekTab overview={overview} /> : null}
              {tab === "global" ? <GlobalTab board={global} /> : null}
              {tab === "friends" ? <FriendsTab board={friends} /> : null}
              {tab === "class" ? <ClassTab data={classroom} /> : null}
              {tab === "rewards" ? <RewardsTab history={history} winners={winners} /> : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      </SkyBackground>
    </AuthGate>
  );
}

function WeekTab({ overview }: { overview: ChallengeOverview }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>🎯 Weekly goals</Text>
        {overview.goals.map((g) => (
          <View key={g.key} style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.goalLabel}>
                {g.done ? "✅ " : ""}
                {g.label}
              </Text>
              <Text style={styles.goalNum}>
                {Math.min(g.current, g.target)}/{g.target}
              </Text>
            </View>
            <ProgressBar value={g.current} max={g.target} color={g.done ? colors.mint : colors.primary} />
          </View>
        ))}
      </View>

      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>🏅 This week&apos;s badges</Text>
        {overview.weekBadges.length ? (
          <View style={styles.badgeRow}>
            {overview.weekBadges.map((b) => (
              <View key={b.key} style={styles.badge}>
                <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                <Text style={styles.badgeTitle}>{b.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>
            Reach a goal to win ⭐ Weekly Star, 🔥 Learning Champion or 🌈 Perfect Week!
          </Text>
        )}
      </View>

      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>✨ How to earn points</Text>
        {overview.pointsTable
          .filter((p) => p.points > 0)
          .map((p) => {
            const mine = overview.bySource.find((s) => s.source === p.source);
            return (
              <View key={p.source} style={styles.rowBetween}>
                <Text style={styles.goalLabel}>{p.label}</Text>
                <Text style={styles.goalNum}>
                  +{p.points}
                  {mine?.points ? `  ·  you: ${mine.points}` : ""}
                </Text>
              </View>
            );
          })}
        <Text style={styles.muted}>
          Finish a game with at least 3 right answers to earn points. Each game and topic gives points up
          to {overview.repeatLimitPerDay} times a day, so try new topics too!
        </Text>
      </View>
    </View>
  );
}

function BoardRow({ e }: { e: BoardEntry }) {
  return (
    <View style={[styles.boardRow, e.isMe && styles.boardMe]}>
      <Text style={styles.boardRank}>{e.rank <= 3 ? MEDALS[e.rank - 1] : `#${e.rank}`}</Text>
      <Text style={styles.boardName} numberOfLines={1}>
        {e.nickname}
        {e.isMe ? " (you)" : ""} {e.badge ?? ""}
      </Text>
      <Text style={styles.boardPts}>{e.points}</Text>
    </View>
  );
}

function Podium({ top }: { top: BoardEntry[] }) {
  const order = [top[1], top[0], top[2]];
  const heights = [70, 96, 56];
  return (
    <View style={styles.podium}>
      {order.map((e, i) =>
        e ? (
          <View key={e.rank} style={styles.podiumCol}>
            <Text style={styles.podiumMedal}>{MEDALS[e.rank - 1]}</Text>
            <Text style={styles.podiumName} numberOfLines={1}>
              {e.nickname}
            </Text>
            <View style={[styles.podiumBlock, { height: heights[i] }, e.isMe && { backgroundColor: colors.mint }]}>
              <Text style={styles.podiumPts}>{e.points}</Text>
            </View>
          </View>
        ) : (
          <View key={`empty-${i}`} style={styles.podiumCol} />
        )
      )}
    </View>
  );
}

function GlobalTab({ board }: { board: GlobalBoard | null }) {
  if (!board) return <Text style={styles.muted}>Leaderboard is not available right now.</Text>;
  if (!board.enabled) {
    return (
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>🌍 Global leaderboard is resting</Text>
        <Text style={styles.muted}>Keep earning points — your weekly goals still count!</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {!board.optedIn ? (
        <View style={[styles.card, shadow.soft, { backgroundColor: colors.skySoft }]}>
          <Text style={styles.cardTitle}>🔒 Want to join?</Text>
          <Text style={styles.muted}>
            Ask your parent to choose a nickname and turn on the global leaderboard in Parent → Challenge
            settings. Your real name is never shown.
          </Text>
        </View>
      ) : board.me ? (
        <View style={[styles.card, shadow.soft, { backgroundColor: colors.mintSoft }]}>
          <Text style={styles.cardTitle}>
            You are #{board.me.rank} of {board.players} 🎉
          </Text>
          <Text style={styles.muted}>Every game you finish moves you up. Keep going!</Text>
        </View>
      ) : (
        <View style={[styles.card, shadow.soft, { backgroundColor: colors.mintSoft }]}>
          <Text style={styles.cardTitle}>Finish a game to join this week&apos;s board!</Text>
        </View>
      )}
      {board.top.length ? (
        <View style={[styles.card, shadow.soft]}>
          <Podium top={board.top.slice(0, 3)} />
          {board.top.slice(3).map((e) => (
            <BoardRow key={e.rank} e={e} />
          ))}
          {board.nearby.length ? (
            <>
              <Text style={styles.dots}>• • •</Text>
              {board.nearby.map((e) => (
                <BoardRow key={e.rank} e={e} />
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>No points yet this week — be the first!</Text>
      )}
    </View>
  );
}

function FriendsTab({ board }: { board: FriendBoard | null }) {
  if (!board?.enabled) return <Text style={styles.muted}>Friends Challenge is resting right now.</Text>;
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>🤝 Friends this week</Text>
        {board.entries.map((e) => (
          <BoardRow key={`${e.rank}-${e.nickname}`} e={e} />
        ))}
        {board.entries.length <= 1 ? (
          <Text style={styles.muted}>
            Ask your parent to add friends with an invite code in Parent → Challenge settings.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ClassTab({ data }: { data: ChildClassroom | null }) {
  if (!data?.enabled) return <Text style={styles.muted}>Classroom challenges are resting right now.</Text>;
  return (
    <View style={{ gap: 12 }}>
      {!data.current.length ? (
        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.cardTitle}>🏫 No class challenge this week</Text>
          <Text style={styles.muted}>When your teacher starts one, it will show up here.</Text>
        </View>
      ) : (
        data.current.map((c) => {
          const me = c.board.find((b) => b.isMe);
          return (
            <View key={c.id} style={[styles.card, shadow.soft]}>
              <Text style={styles.cardTitle}>
                🏫 {c.title} · {c.classroomName}
              </Text>
              {me ? (
                <View style={{ gap: 4 }}>
                  <Text style={styles.goalLabel}>
                    Class goal: {Math.min(me.points, c.goalPoints)}/{c.goalPoints} points
                  </Text>
                  <ProgressBar value={me.points} max={c.goalPoints} color={colors.accent} />
                </View>
              ) : null}
              {c.board.map((b) => (
                <View key={`${b.rank}-${b.name}`} style={[styles.boardRow, b.isMe && styles.boardMe]}>
                  <Text style={styles.boardRank}>{b.rank <= 3 && b.points > 0 ? MEDALS[b.rank - 1] : "⭐"}</Text>
                  <Text style={styles.boardName} numberOfLines={1}>
                    {b.name} {b.badges.map((x) => x.emoji).join("")}
                  </Text>
                  <Text style={styles.boardPts}>{b.points}</Text>
                </View>
              ))}
            </View>
          );
        })
      )}
      {data.badges.length ? (
        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.cardTitle}>🎖️ Badges from my teacher</Text>
          {data.badges.map((b) => (
            <Text key={b.code} style={styles.goalLabel}>
              {b.emoji} {b.title} <Text style={styles.muted}>· {b.description}</Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RewardsTab({ history, winners }: { history: ChallengeHistory | null; winners: Winners | null }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>📅 My weeks</Text>
        {history?.weeks.length ? (
          history.weeks.map((w) => (
            <View key={w.weekStart} style={styles.rowBetween}>
              <Text style={styles.goalLabel}>
                Week of {weekOf(w.weekStart)} {w.badges.map((b) => b.emoji).join("")}
              </Text>
              <Text style={styles.goalNum}>
                {w.points} pts{w.globalRank ? ` · #${w.globalRank}` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Your weeks will appear here.</Text>
        )}
      </View>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>🏅 All my challenge badges</Text>
        {history?.badges.length ? (
          <View style={styles.badgeRow}>
            {history.badges.map((b) => (
              <View key={b.code} style={styles.badge}>
                <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                <Text style={styles.badgeTitle}>{b.title}</Text>
                <Text style={styles.badgeSub}>{new Date(b.earnedAt).toLocaleDateString("en-GB")}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Win your first badge by reaching a weekly goal!</Text>
        )}
      </View>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.cardTitle}>👑 Previous winners</Text>
        {winners?.length ? (
          winners.map((w) => (
            <View key={w.weekStart} style={{ gap: 2 }}>
              <Text style={styles.goalNum}>Week of {weekOf(w.weekStart)}</Text>
              {w.winners.map((x) => (
                <Text key={x.rank} style={styles.goalLabel}>
                  {MEDALS[x.rank - 1]} {x.nickname} · {x.points} pts
                </Text>
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.muted}>The first winners will be crowned when this week ends.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 16, gap: 14, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  hero: { borderRadius: radii.xl, padding: 18, gap: 8 },
  heroKicker: { color: "#fff", fontWeight: "700", opacity: 0.95 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroTrophy: { width: 84, height: 84 },
  heroPoints: { color: "#fff", fontSize: 44, fontWeight: "900" },
  heroLabel: { color: "#fff", fontWeight: "700" },
  heroSide: { alignItems: "flex-end" },
  heroSideNum: { color: "#fff", fontWeight: "900", fontSize: 16 },
  heroSideLabel: { color: "#fff", fontSize: 11, opacity: 0.9, marginBottom: 4 },
  heroFoot: { color: "#fff", fontWeight: "800" },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontWeight: "800", color: colors.text },
  tabTextOn: { color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: radii.lg, padding: 16, gap: 10 },
  cardTitle: { fontWeight: "900", fontSize: 17, color: colors.text },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  goalLabel: { fontWeight: "700", color: colors.text, flexShrink: 1 },
  goalNum: { fontWeight: "800", color: colors.primaryDark },
  muted: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: {
    width: 100,
    alignItems: "center",
    backgroundColor: colors.yellowSoft,
    borderRadius: radii.md,
    padding: 10,
    gap: 2,
  },
  badgeEmoji: { fontSize: 32 },
  badgeTitle: { fontWeight: "800", fontSize: 12, color: colors.text, textAlign: "center" },
  badgeSub: { fontSize: 10, color: colors.textMuted },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.bg,
  },
  boardMe: { backgroundColor: colors.mintSoft, borderWidth: 2, borderColor: colors.mint },
  boardRank: { width: 38, fontWeight: "900", fontSize: 16, textAlign: "center", color: colors.text },
  boardName: { flex: 1, fontWeight: "800", color: colors.text },
  boardPts: { fontWeight: "900", color: colors.primaryDark },
  dots: { textAlign: "center", color: colors.textMuted, fontWeight: "900" },
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10, paddingTop: 6 },
  podiumCol: { flex: 1, alignItems: "center", gap: 4 },
  podiumMedal: { fontSize: 34 },
  podiumName: { fontWeight: "800", fontSize: 12, color: colors.text, textAlign: "center" },
  podiumBlock: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumPts: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
