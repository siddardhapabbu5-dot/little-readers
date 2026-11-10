import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, KeyboardScroll, PrimaryButton, ProgressBar, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import {
  MEDALS,
  formatCountdown,
  type ChallengeOverview,
  type ChildChallengeSettings,
  type ChildClassroom,
  type FriendList,
  type GlobalBoard,
} from "../services/challenges";
import { APP_NAME } from "@little-readers/shared";
import { colors, radii } from "../theme";

/** Parent controls for Challenge World: nickname, global consent, friends, weekly results. */
export default function ParentChallengesScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [settings, setSettings] = useState<ChildChallengeSettings | null>(null);
  const [overview, setOverview] = useState<ChallengeOverview | null>(null);
  const [friends, setFriends] = useState<FriendList | null>(null);
  const [board, setBoard] = useState<GlobalBoard | null>(null);
  const [classroom, setClassroom] = useState<ChildClassroom | null>(null);
  const [childName, setChildName] = useState("");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!childId) return;
    const q = `?childId=${encodeURIComponent(childId)}`;
    const [s, ov, fr, gl, cl, kids] = await Promise.all([
      apiRequest<ChildChallengeSettings>(`/challenges/children/${encodeURIComponent(childId)}/settings`),
      apiRequest<ChallengeOverview>(`/challenges/overview${q}`),
      apiRequest<FriendList>(`/challenges/friends${q}`),
      apiRequest<GlobalBoard>(`/challenges/global${q}`),
      apiRequest<ChildClassroom>(`/challenges/classroom${q}`),
      apiRequest<{ id: string; displayName: string }[]>("/children").catch(() => []),
    ]);
    setSettings(s);
    setNickname(s.nickname ?? "");
    setOverview(ov);
    setFriends(fr);
    setBoard(gl);
    setClassroom(cl);
    setChildName(kids.find((k) => k.id === childId)?.displayName ?? "");
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load"));
    }, [load])
  );

  async function run(action: () => Promise<unknown>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      await load();
      if (okMessage) setInfo(okMessage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const saveSettings = (body: { nickname?: string | null; globalOptIn?: boolean }, ok: string) =>
    run(
      () =>
        apiRequest(`/challenges/children/${encodeURIComponent(childId)}/settings`, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      ok
    );

  async function shareCode(invite: string) {
    const message = `Join my child's ${APP_NAME} Friends Challenge! In ${APP_NAME}, open Parent → Challenge settings and enter code ${invite}.`;
    try {
      await Share.share({ message });
    } catch {
      setInfo(`Invitation code: ${invite}`);
    }
  }

  const features = settings?.features;

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
        <SafeAreaView style={styles.safe}>
          <KeyboardScroll contentContainerStyle={styles.content}>
            <SoftButton label="← Back" onPress={() => router.back()} />
            <Title>🏆 Challenge settings{childName ? ` · ${childName}` : ""}</Title>
            <Text style={styles.sub}>
              You decide what your child can join. There is no chat, no messaging and no public profile. Only
              the nickname you approve is ever shown.
            </Text>
            <ErrorText>{error}</ErrorText>
            {info ? <Text style={styles.info}>{info}</Text> : null}
            {!settings ? <ActivityIndicator color={colors.primary} /> : null}

            {settings && overview ? (
              <>
                <Card style={{ gap: 8 }} color={colors.primarySoft}>
                  <Text style={styles.section}>This week</Text>
                  <Text style={styles.big}>{overview.weekPoints} points</Text>
                  <Text style={styles.item}>
                    Ends in {formatCountdown(new Date(overview.endsAt).getTime() - Date.now())} · all-time{" "}
                    {overview.lifetimePoints} points · {overview.lifetimeBadges} challenge badges
                  </Text>
                  {overview.globalRank ? (
                    <Text style={styles.item}>
                      Global rank: #{overview.globalRank.rank} of {overview.globalRank.players}
                    </Text>
                  ) : null}
                  {overview.goals.map((g) => (
                    <View key={g.key} style={{ gap: 3 }}>
                      <Text style={styles.item}>
                        {g.done ? "✅" : "▫️"} {g.label} ({Math.min(g.current, g.target)}/{g.target})
                      </Text>
                      <ProgressBar value={g.current} max={g.target} color={g.done ? colors.mint : colors.primary} />
                    </View>
                  ))}
                  {overview.weekBadges.length ? (
                    <Text style={styles.item}>
                      Badges this week: {overview.weekBadges.map((b) => `${b.emoji} ${b.title}`).join(", ")}
                    </Text>
                  ) : null}
                </Card>

                <Card style={{ gap: 8 }}>
                  <Text style={styles.section}>Leaderboard nickname</Text>
                  <Text style={styles.item}>
                    3–20 letters or numbers. It must not contain your child&apos;s real name, phone number or other
                    personal details.
                  </Text>
                  {settings.nicknameHidden ? (
                    <Text style={styles.warn}>
                      This nickname was hidden by Learn Wise moderators. Please choose a new one.
                    </Text>
                  ) : null}
                  <TextInput
                    value={nickname}
                    onChangeText={setNickname}
                    placeholder="e.g. Brave Tiger 27"
                    maxLength={20}
                    style={styles.input}
                  />
                  <View style={styles.chips}>
                    {settings.suggestions.map((s) => (
                      <Pressable key={s} onPress={() => setNickname(s)} style={styles.chip}>
                        <Text style={styles.chipText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <PrimaryButton
                    label="Approve nickname"
                    loading={busy}
                    disabled={!nickname.trim() || nickname.trim() === settings.nickname}
                    onPress={() => void saveSettings({ nickname: nickname.trim() }, "Nickname approved")}
                  />
                </Card>

                <Card style={{ gap: 8 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.section}>Global weekly leaderboard</Text>
                    <Switch
                      value={settings.globalOptIn}
                      disabled={busy || !features?.global || (!settings.globalOptIn && !settings.nickname)}
                      onValueChange={(v) =>
                        void saveSettings(
                          { globalOptIn: v },
                          v ? "Global leaderboard turned ON" : "Global leaderboard turned OFF"
                        )
                      }
                    />
                  </View>
                  <Text style={styles.item}>
                    {!features?.global
                      ? "The global leaderboard is switched off by Learn Wise right now."
                      : settings.globalOptIn
                        ? `ON since ${new Date(settings.globalConsentAt ?? Date.now()).toLocaleDateString("en-GB")}. Your child appears only as “${settings.nickname}”. You can turn this off at any time.`
                        : "OFF (default). Turning it on shows only the approved nickname, weekly points and badges to other learners."}
                  </Text>
                  {!settings.nickname && features?.global ? (
                    <Text style={styles.warn}>Approve a nickname first.</Text>
                  ) : null}
                </Card>

                {features?.friends && friends ? (
                  <Card style={{ gap: 8 }}>
                    <Text style={styles.section}>Friends Challenge</Text>
                    <Text style={styles.item}>
                      Share an invitation code with a parent you know. Friends see only nicknames and weekly
                      points. Both parents must agree, and either of you can remove the connection.
                    </Text>

                    {friends.waitingForYou.map((r) => (
                      <View key={r.id} style={styles.requestRow}>
                        <Text style={[styles.item, { flex: 1 }]}>“{r.nickname}” wants to be friends</Text>
                        <SoftButton
                          label="Approve"
                          onPress={() =>
                            void run(
                              () =>
                                apiRequest(`/challenges/friends/${r.id}/respond`, {
                                  method: "POST",
                                  body: JSON.stringify({ approve: true }),
                                }),
                              "Friend approved"
                            )
                          }
                        />
                        <SoftButton
                          label="Reject"
                          onPress={() =>
                            void run(
                              () =>
                                apiRequest(`/challenges/friends/${r.id}/respond`, {
                                  method: "POST",
                                  body: JSON.stringify({ approve: false }),
                                }),
                              "Request rejected"
                            )
                          }
                        />
                      </View>
                    ))}

                    <Text style={styles.subSection}>Friends ({friends.friends.length})</Text>
                    {friends.friends.length ? (
                      friends.friends.map((f) => (
                        <View key={f.id} style={styles.requestRow}>
                          <Text style={[styles.item, { flex: 1 }]}>🤝 {f.nickname}</Text>
                          <SoftButton
                            label="Remove"
                            onPress={() =>
                              void run(
                                () => apiRequest(`/challenges/friends/${f.id}`, { method: "DELETE" }),
                                "Friend removed"
                              )
                            }
                          />
                        </View>
                      ))
                    ) : (
                      <Text style={styles.item}>No friends yet.</Text>
                    )}
                    {friends.waitingForOther.map((r) => (
                      <Text key={r.id} style={styles.item}>
                        ⏳ Waiting for “{r.nickname}”&apos;s parent to approve
                      </Text>
                    ))}

                    <Text style={styles.subSection}>Invite a friend</Text>
                    {friends.openInvites.map((i) => (
                      <View key={i.id} style={styles.requestRow}>
                        <Text style={styles.code}>{i.code}</Text>
                        <Text style={[styles.item, { flex: 1 }]}>
                          valid until {new Date(i.expiresAt).toLocaleDateString("en-GB")}
                        </Text>
                        <SoftButton label="Share" onPress={() => void shareCode(i.code)} />
                        <SoftButton
                          label="Cancel"
                          onPress={() =>
                            void run(() => apiRequest(`/challenges/friends/${i.id}`, { method: "DELETE" }))
                          }
                        />
                      </View>
                    ))}
                    <SoftButton
                      label="Create invitation code"
                      onPress={() =>
                        void run(
                          () =>
                            apiRequest("/challenges/friends/invite", {
                              method: "POST",
                              body: JSON.stringify({ childId }),
                            }),
                          "Invitation code created — share it with the other parent"
                        )
                      }
                    />

                    <Text style={styles.subSection}>Have a code from another parent?</Text>
                    <View style={styles.requestRow}>
                      <TextInput
                        value={code}
                        onChangeText={(t) => setCode(t.toUpperCase())}
                        placeholder="8-letter code"
                        autoCapitalize="characters"
                        maxLength={12}
                        style={[styles.input, { flex: 1 }]}
                      />
                      <SoftButton
                        label="Join"
                        onPress={() =>
                          void run(async () => {
                            const r = await apiRequest<{ status: string }>("/challenges/friends/join", {
                              method: "POST",
                              body: JSON.stringify({ childId, code: code.trim() }),
                            });
                            setCode("");
                            return r;
                          }, "Request sent — the other parent needs to approve it")
                        }
                      />
                    </View>
                  </Card>
                ) : null}

                {features?.classroom && classroom ? (
                  <Card style={{ gap: 8 }}>
                    <Text style={styles.section}>Classroom challenges</Text>
                    {classroom.current.length ? (
                      classroom.current.map((c) => {
                        const me = c.board.find((b) => b.isMe);
                        return (
                          <Text key={c.id} style={styles.item}>
                            🏫 {c.title} ({c.classroomName}) · {me?.points ?? 0}/{c.goalPoints} points · rank #
                            {me?.rank ?? "-"} of {c.board.length}
                          </Text>
                        );
                      })
                    ) : (
                      <Text style={styles.item}>No classroom challenge this week.</Text>
                    )}
                    {classroom.badges.length ? (
                      <Text style={styles.item}>
                        Teacher badges: {classroom.badges.map((b) => `${b.emoji} ${b.title}`).join(", ")}
                      </Text>
                    ) : null}
                    <Text style={styles.hint}>
                      Classroom rankings are visible only to the teacher and the children in that challenge.
                    </Text>
                  </Card>
                ) : null}

                {board?.enabled && board.top.length ? (
                  <Card style={{ gap: 6 }}>
                    <Text style={styles.section}>Global top 10 (nicknames only)</Text>
                    {board.top.map((e) => (
                      <View key={e.rank} style={styles.requestRow}>
                        <Text style={[styles.item, { flex: 1 }]}>
                          {e.rank <= 3 ? MEDALS[e.rank - 1] : `#${e.rank}`} {e.nickname}
                          {e.isMe ? " (your child)" : ""} · {e.points}
                        </Text>
                        {!e.isMe && e.key ? (
                          <Pressable
                            onPress={() =>
                              void run(
                                () =>
                                  apiRequest("/challenges/report", {
                                    method: "POST",
                                    body: JSON.stringify({ key: e.key, reason: "Inappropriate nickname" }),
                                  }),
                                "Thanks — our team will review this nickname"
                              )
                            }
                          >
                            <Text style={styles.report}>Report</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}
          </KeyboardScroll>
        </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  sub: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  info: { color: colors.mintDeep, fontWeight: "700" },
  warn: { color: colors.danger, fontWeight: "700" },
  section: { fontWeight: "900", fontSize: 17, color: colors.text },
  subSection: { fontWeight: "800", fontSize: 14, color: colors.text, marginTop: 6 },
  big: { fontWeight: "900", fontSize: 28, color: colors.primaryDark },
  item: { color: colors.text, fontWeight: "600", lineHeight: 20 },
  hint: { color: colors.textMuted, fontSize: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontWeight: "700",
    color: colors.text,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.yellowSoft, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontWeight: "700", color: colors.text },
  code: { fontWeight: "900", fontSize: 18, letterSpacing: 2, color: colors.primaryDark },
  report: { color: colors.danger, fontWeight: "800", fontSize: 12 },
});
