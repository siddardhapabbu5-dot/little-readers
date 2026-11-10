import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { POINT_SOURCES, POINT_SOURCE_LABELS, type PointSource, type WeeklyGoals } from "@little-readers/shared";
import { Card, ErrorText, KeyboardScroll, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { MEDALS, weekOf } from "../services/challenges";
import { colors, radii } from "../theme";

type Config = {
  globalEnabled: boolean;
  friendsEnabled: boolean;
  classroomEnabled: boolean;
  points: Record<PointSource, number>;
  goals: WeeklyGoals;
};
type Stats = {
  weekStart: string;
  thisWeek: { players: number; points: number; awards: number; classroomChallenges: number };
  optedIn: number;
  nicknames: number;
  friends: number;
  pendingFriends: number;
  openReports: number;
  history: { weekStart: string; points: number; players: number; winners: { rank: number; nickname: string; points: number }[] }[];
};
type NicknameRow = {
  childId: string;
  displayName: string;
  nickname: string;
  hidden: boolean;
  globalOptIn: boolean;
  openReports: { id: string; reason: string | null; createdAt: string }[];
};
type Badges = {
  catalog: { key: string; title: string; emoji: string; description: string; type: string; awarded: number }[];
  recent: { id: string; title: string; description: string | null; earnedAt: string; emoji: string; child: string }[];
};

const GOAL_FIELDS: { key: keyof WeeklyGoals; label: string }[] = [
  { key: "points", label: "Weekly Star: points goal" },
  { key: "activeDays", label: "Learning Champion: active days" },
  { key: "dailyChallenges", label: "Daily Challenges per week" },
  { key: "activities", label: "Different activities per week" },
  { key: "repeatLimitPerDay", label: "Same game + topic pays max. times/day" },
];

/** Admin: Challenge World switches, points, goals, stats, nickname moderation and badges. */
export default function AdminChallengesScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [names, setNames] = useState<NicknameRow[]>([]);
  const [reportedOnly, setReportedOnly] = useState(false);
  const [badges, setBadges] = useState<Badges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (onlyReported = reportedOnly) => {
    const [c, s, n, b] = await Promise.all([
      apiRequest<Config>("/challenges/admin/config"),
      apiRequest<Stats>("/challenges/admin/stats"),
      apiRequest<NicknameRow[]>(`/challenges/admin/nicknames${onlyReported ? "?reported=1" : ""}`),
      apiRequest<Badges>("/challenges/admin/badges"),
    ]);
    setConfig(c);
    setPoints(Object.fromEntries(POINT_SOURCES.map((k) => [k, String(c.points[k])])));
    setGoals(Object.fromEntries(GOAL_FIELDS.map((g) => [g.key, String(c.goals[g.key])])));
    setStats(s);
    setNames(n);
    setBadges(b);
  }, [reportedOnly]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load"));
    }, [load])
  );

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      await load();
      setInfo(ok);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const putConfig = (body: Record<string, unknown>, ok: string) =>
    run(() => apiRequest("/challenges/admin/config", { method: "PUT", body: JSON.stringify(body) }), ok);

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>🏆 Challenge World</Title>
          <Text style={styles.sub}>
            Weekly points, leaderboards, friends and classroom challenges. These settings apply to every
            parent, teacher and child screen. Points are separate from payments.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {!config ? <ActivityIndicator color={colors.primary} /> : null}

          {config ? (
            <>
              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Features</Text>
                {(
                  [
                    ["globalEnabled", "Global weekly leaderboard (parent opt-in)"],
                    ["friendsEnabled", "Friends Challenge"],
                    ["classroomEnabled", "Classroom challenges"],
                  ] as const
                ).map(([key, label]) => (
                  <View key={key} style={styles.rowBetween}>
                    <Text style={styles.item}>{label}</Text>
                    <Switch
                      value={config[key]}
                      disabled={busy}
                      onValueChange={(v) => void putConfig({ [key]: v }, `${label} ${v ? "ON" : "OFF"}`)}
                    />
                  </View>
                ))}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Points per verified completion</Text>
                {POINT_SOURCES.map((s) => (
                  <View key={s} style={styles.rowBetween}>
                    <Text style={styles.item}>{POINT_SOURCE_LABELS[s]}</Text>
                    <TextInput
                      value={points[s] ?? ""}
                      onChangeText={(t) => setPoints((p) => ({ ...p, [s]: t.replace(/\D/g, "") }))}
                      keyboardType="number-pad"
                      maxLength={3}
                      style={styles.num}
                    />
                  </View>
                ))}
                <Text style={styles.sectionSmall}>Weekly goals</Text>
                {GOAL_FIELDS.map((g) => (
                  <View key={g.key} style={styles.rowBetween}>
                    <Text style={styles.item}>{g.label}</Text>
                    <TextInput
                      value={goals[g.key] ?? ""}
                      onChangeText={(t) => setGoals((p) => ({ ...p, [g.key]: t.replace(/\D/g, "") }))}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.num}
                    />
                  </View>
                ))}
                <PrimaryButton
                  label="Save points & goals"
                  loading={busy}
                  onPress={() =>
                    void putConfig(
                      {
                        points: Object.fromEntries(POINT_SOURCES.map((s) => [s, Number(points[s] || 0)])),
                        goals: Object.fromEntries(GOAL_FIELDS.map((g) => [g.key, Number(goals[g.key] || 0)])),
                      },
                      "Points and goals saved"
                    )
                  }
                />
              </Card>
            </>
          ) : null}

          {stats ? (
            <Card style={{ gap: 6 }} color={colors.primarySoft}>
              <Text style={styles.section}>Participation · week of {weekOf(stats.weekStart)}</Text>
              <View style={styles.statGrid}>
                <Stat label="Children earning" value={stats.thisWeek.players} />
                <Stat label="Points this week" value={stats.thisWeek.points} />
                <Stat label="Global opt-ins" value={stats.optedIn} />
                <Stat label="Friend links" value={stats.friends} />
                <Stat label="Pending friends" value={stats.pendingFriends} />
                <Stat label="Class challenges" value={stats.thisWeek.classroomChallenges} />
                <Stat label="Open reports" value={stats.openReports} />
              </View>
              <Text style={styles.sectionSmall}>History</Text>
              {stats.history.length ? (
                stats.history.map((h) => (
                  <Text key={h.weekStart} style={styles.item}>
                    Week of {weekOf(h.weekStart)} · {h.players} children · {h.points} pts
                    {h.winners.length
                      ? ` · ${h.winners.map((w) => `${MEDALS[w.rank - 1]} ${w.nickname}`).join("  ")}`
                      : ""}
                  </Text>
                ))
              ) : (
                <Text style={styles.item}>No weeks yet.</Text>
              )}
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.section}>Nicknames</Text>
              <SoftButton
                label={reportedOnly ? "Show all" : "Reported only"}
                active={reportedOnly}
                onPress={() => {
                  const next = !reportedOnly;
                  setReportedOnly(next);
                  void load(next);
                }}
              />
            </View>
            {!names.length ? <Text style={styles.item}>Nothing to review.</Text> : null}
            {names.map((n) => (
              <View key={n.childId} style={styles.nameRow}>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={styles.item}>
                    {n.hidden ? "🚫 " : ""}
                    {n.nickname} <Text style={styles.muted}>({n.displayName})</Text>
                  </Text>
                  <Text style={styles.muted}>
                    {n.globalOptIn ? "Global ON" : "Global OFF"}
                    {n.openReports.length ? ` · ⚑ ${n.openReports.length} report(s)` : ""}
                  </Text>
                </View>
                <SoftButton
                  label={n.hidden ? "Unhide" : "Hide"}
                  onPress={() =>
                    void run(
                      () =>
                        apiRequest(`/challenges/admin/nicknames/${n.childId}`, {
                          method: "PUT",
                          body: JSON.stringify({ hidden: !n.hidden }),
                        }),
                      n.hidden ? "Nickname visible again" : "Nickname hidden from all leaderboards"
                    )
                  }
                />
                <SoftButton
                  label="Reset"
                  onPress={() =>
                    void run(
                      () =>
                        apiRequest(`/challenges/admin/nicknames/${n.childId}`, {
                          method: "PUT",
                          body: JSON.stringify({ clear: true }),
                        }),
                      "Nickname removed; the parent must choose a new one"
                    )
                  }
                />
                {n.openReports.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() =>
                      void run(
                        () => apiRequest(`/challenges/admin/reports/${r.id}/dismiss`, { method: "POST" }),
                        "Report dismissed"
                      )
                    }
                  >
                    <Text style={styles.link}>Dismiss report</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </Card>

          {badges ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Badges</Text>
              <View style={styles.statGrid}>
                {badges.catalog.map((b) => (
                  <View key={b.key} style={styles.badge}>
                    <Text style={{ fontSize: 26 }}>{b.emoji}</Text>
                    <Text style={styles.badgeTitle}>{b.title}</Text>
                    <Text style={styles.muted}>
                      {b.type === "weekly" ? "Weekly" : "Teacher"} · {b.awarded} awarded
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionSmall}>Recent awards</Text>
              {badges.recent.length ? (
                badges.recent.map((r) => (
                  <View key={r.id} style={styles.nameRow}>
                    <Text style={[styles.item, { flex: 1 }]}>
                      {r.emoji} {r.title} → {r.child}{" "}
                      <Text style={styles.muted}>· {new Date(r.earnedAt).toLocaleDateString("en-GB")}</Text>
                    </Text>
                    <Pressable
                      onPress={() =>
                        void run(
                          () => apiRequest(`/challenges/admin/badges/${r.id}`, { method: "DELETE" }),
                          "Badge revoked"
                        )
                      }
                    >
                      <Text style={styles.link}>Revoke</Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text style={styles.item}>No challenge badges awarded yet.</Text>
              )}
            </Card>
          ) : null}
        </KeyboardScroll>
      </SafeAreaView>
    </AuthGate>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  sub: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  info: { color: colors.mintDeep, fontWeight: "700" },
  section: { fontWeight: "900", fontSize: 17, color: colors.text },
  sectionSmall: { fontWeight: "800", fontSize: 14, color: colors.text, marginTop: 6 },
  item: { color: colors.text, fontWeight: "600", flexShrink: 1 },
  muted: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  link: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  num: {
    width: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
    fontWeight: "800",
    textAlign: "center",
    color: colors.text,
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { backgroundColor: "#fff", borderRadius: radii.sm, padding: 10, minWidth: 110, flexGrow: 1 },
  statNum: { fontWeight: "900", fontSize: 20, color: colors.primaryDark },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badge: { width: 120, backgroundColor: colors.yellowSoft, borderRadius: radii.sm, padding: 8, gap: 2 },
  badgeTitle: { fontWeight: "800", fontSize: 12, color: colors.text },
});
