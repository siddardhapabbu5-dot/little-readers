import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, Field, KeyboardScroll, PrimaryButton, SoftButton, Title } from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { RequireParentGate } from "../../components/RequireParentGate";
import { GradePicker, type LearnWiseGrade } from "../../components/GradePicker";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import { clearActiveChild, getActiveChild, saveActiveChild } from "../../services/secure";
import { colors } from "../../theme";

type ChildProfile = {
  id: string;
  displayName: string;
  birthYear: number;
  birthDate?: string | null;
  levelId?: string | null;
  gradeId?: string | null;
  level?: { id?: string; code: string; label: string } | null;
  grade?: {
    id: string;
    code: string;
    label: string;
    gradeNumber: number | null;
  } | null;
  learnWiseGrade?: { levelId: string; levelCode: string; gradeLabel: string } | null;
  ageGroup?: { code: string; label: string } | null;
  parent?: { id: string; name: string; email: string };
  device?: { registered: boolean; platform?: string; deviceLabel?: string | null };
};

function formatBirthdayInput(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type ProgressPayload = {
  child: { id: string; displayName: string; birthYear: number; level?: { code: string; label: string } | null };
  progress: { wordsLearned?: number; readingScore?: number; spellingScore?: number; minutesLearned?: number } | null;
  level1: {
    categoriesCompleted: number;
    wordsLearned: number;
    points: number;
    stars: number;
    minutesLearned: number;
    categories: Array<{
      label: string;
      emoji: string;
      group: string;
      completed: boolean;
      wordsLearned: number;
      points: number;
      stars: number;
      listenCorrect: number;
      listenAttempts: number;
      spellCorrect: number;
      spellAttempts: number;
    }>;
    recentSessions: Array<{
      category: string;
      emoji: string;
      points: number;
      stars: number;
      wordsLearned: number;
      completedAt: string | null;
    }>;
    achievements: Array<{ id: string; title: string; code: string; description?: string | null; earnedAt: string }>;
  };
};

export default function ChildDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const childId = String(params.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [dashboard, setDashboard] = useState<{
    summary?: {
      wordsAttempted?: number;
      wordsCorrect?: number;
      wordsNeedingPractice?: number;
      accuracy?: number;
      activitiesCompleted?: number;
      points?: number;
      stars?: number;
      categoriesCompleted?: number;
      daily?: { wordsLearnedToday: number; target: number };
      weekly?: { wordsLearned: number };
    };
    weakWords?: Array<{ text: string; emoji: string; categoryLabel: string }>;
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
    }>;
    achievements?: Array<{
      code: string;
      title: string;
      unlocked: boolean;
      earnedAt?: string | null;
    }>;
    categories?: Array<{
      categoryId: string;
      label: string;
      emoji: string;
      wordsLearned: number;
      wordCount: number;
      completed: boolean;
      stars: number;
      progressPct: number;
    }>;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [learnWiseGrades, setLearnWiseGrades] = useState<LearnWiseGrade[]>([]);
  const [editLevelId, setEditLevelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!childId) {
      setError("Missing child id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, prog, dash] = await Promise.all([
        apiRequest<ChildProfile>(`/children/${childId}`),
        apiRequest<ProgressPayload>(`/children/${childId}/progress`).catch(
          () => null
        ),
        apiRequest<NonNullable<typeof dashboard>>(
          `/learning/progress/${childId}`
        ).catch(() => null),
      ]);
      setProfile(p);
      setProgress(prog);
      setDashboard(dash);
      setName(p.displayName);
      setBirthDate(p.birthDate ?? `01/01/${p.birthYear}`);
      setEditLevelId(p.learnWiseGrade?.levelId ?? null);
      setLearnWiseGrades(
        await apiRequest<LearnWiseGrade[]>("/children/learn-wise-grades").catch(() => [])
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load child");
      setProfile(null);
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function saveEdits() {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<ChildProfile>(`/children/${childId}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: name.trim(),
          birthDate: birthDate.trim(),
          ...(editLevelId && editLevelId !== profile?.learnWiseGrade?.levelId
            ? { levelId: editLevelId }
            : {}),
        }),
      });
      setEditing(false);
      await load();
      const active = await getActiveChild<{ id: string }>();
      if (active?.id === childId) {
        await saveActiveChild({
          id: childId,
          displayName: name.trim(),
          birthYear: updated.birthYear,
          birthDate: updated.birthDate ?? birthDate.trim(),
          level: updated.level?.code ?? profile?.level?.code ?? "",
          levelId: updated.levelId ?? editLevelId,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    const run = () => {
      void (async () => {
        setSaving(true);
        setError(null);
        try {
          await apiRequest(`/children/${childId}`, { method: "DELETE" });
          const active = await getActiveChild<{ id: string }>();
          if (active?.id === childId) await clearActiveChild();
          router.replace("/parent");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not delete child");
          setSaving(false);
        }
      })();
    };

    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(`Delete ${profile?.displayName ?? "this child"}? This cannot be undone from the app.`)) {
        run();
      }
      return;
    }

    Alert.alert(
      "Delete child profile?",
      `Remove ${profile?.displayName ?? "this child"} from your account? Learning history stays in the database but the profile will be deactivated and the registered phone revoked.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: run },
      ]
    );
  }

  const l1 = progress?.level1;

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
      <SafeAreaView style={styles.safe}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>{profile?.displayName ?? "Child profile"}</Title>
          <ErrorText>{error}</ErrorText>
          {childId ? (
            <SoftButton
              label="Full learning history"
              onPress={() =>
                router.push({
                  pathname: "/learning-history",
                  params: { childId },
                })
              }
            />
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : !profile ? (
            <Card>
              <Text style={styles.meta}>Child not found or you do not have access.</Text>
            </Card>
          ) : (
            <>
              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Profile</Text>
                {!editing ? (
                  <>
                    <Text style={styles.meta}>
                      Birthday {profile.birthDate ?? `01/01/${profile.birthYear}`}
                    </Text>
                    <Text style={styles.meta}>
                      Learn Wise {profile.learnWiseGrade?.gradeLabel ?? "grade not set"}
                    </Text>
                    {profile.parent ? (
                      <Text style={styles.meta}>Parent {profile.parent.email}</Text>
                    ) : null}
                    <Text style={styles.meta}>
                      Device{" "}
                      {profile.device?.registered
                        ? `${profile.device.platform ?? "phone"}${profile.device.deviceLabel ? ` · ${profile.device.deviceLabel}` : ""}`
                        : "not registered"}
                    </Text>
                    <View style={styles.row}>
                      <SoftButton label="Edit" onPress={() => setEditing(true)} />
                      <SoftButton
                        label="Set active"
                        onPress={() =>
                          void saveActiveChild({
                            id: profile.id,
                            displayName: profile.displayName,
                            birthYear: profile.birthYear,
                            level: profile.level?.code ?? "",
                          })
                        }
                      />
                      <SoftButton
                        label="Learn"
                        onPress={() =>
                          void saveActiveChild({
                            id: profile.id,
                            displayName: profile.displayName,
                            birthYear: profile.birthYear,
                            level: profile.level?.code ?? "",
                          }).then(() => router.push("/(tabs)/learn"))
                        }
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Field label="Display name" value={name} onChangeText={setName} />
                    <Text style={styles.meta}>
                      Learn Wise grade (changing a birthday never changes it; a new grade needs its
                      own subscription)
                    </Text>
                    <GradePicker
                      grades={learnWiseGrades}
                      value={editLevelId}
                      onChange={setEditLevelId}
                      birthYear={profile.birthYear}
                    />
                    <Field
                      label="Birthday (DD/MM/YYYY)"
                      keyboardType="number-pad"
                      placeholder="15/03/2021"
                      value={birthDate}
                      onChangeText={(v) => setBirthDate(formatBirthdayInput(v))}
                      maxLength={10}
                    />
                    <View style={styles.row}>
                      <PrimaryButton label="Save" loading={saving} onPress={() => void saveEdits()} />
                      <SoftButton label="Cancel" onPress={() => setEditing(false)} />
                    </View>
                  </>
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Learning progress report</Text>
                {!dashboard?.summary && !l1 ? (
                  <Text style={styles.meta}>No progress data yet.</Text>
                ) : (
                  <>
                    <Text style={styles.stat}>
                      Correct {dashboard?.summary?.wordsCorrect ?? l1?.wordsLearned ?? 0} ·
                      Tried {dashboard?.summary?.wordsAttempted ?? "—"} · Accuracy{" "}
                      {dashboard?.summary?.accuracy ?? 0}%
                    </Text>
                    <Text style={styles.meta}>
                      Today {dashboard?.summary?.daily?.wordsLearnedToday ?? 0}/
                      {dashboard?.summary?.daily?.target ?? 5} · Week{" "}
                      {dashboard?.summary?.weekly?.wordsLearned ?? 0} · Activities{" "}
                      {dashboard?.summary?.activitiesCompleted ?? 0}
                    </Text>
                    <Text style={styles.meta}>
                      Stars {dashboard?.summary?.stars ?? l1?.stars ?? 0} · Points{" "}
                      {dashboard?.summary?.points ?? l1?.points ?? 0} · Need practice{" "}
                      {dashboard?.summary?.wordsNeedingPractice ?? 0}
                    </Text>
                  </>
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Needs practice</Text>
                {!dashboard?.weakWords?.length ? (
                  <Text style={styles.meta}>
                    No weak words recorded. Incorrect answers appear here for Revision.
                  </Text>
                ) : (
                  dashboard.weakWords.slice(0, 10).map((w, i) => (
                    <Text key={`${w.text}-${i}`} style={styles.meta}>
                      {w.emoji} {w.text} · {w.categoryLabel}
                    </Text>
                  ))
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Categories</Text>
                {!(dashboard?.categories?.length || l1?.categories?.length) ? (
                  <Text style={styles.meta}>
                    No category progress yet. Start an activity from Learn or Games.
                  </Text>
                ) : dashboard?.categories?.length ? (
                  dashboard.categories.map((c) => (
                    <View key={c.categoryId} style={styles.catRow}>
                      <Text style={styles.catTitle}>
                        {c.emoji} {c.label}
                        {c.completed ? " · done" : ""}
                      </Text>
                      <Text style={styles.meta}>
                        {c.wordsLearned}/{c.wordCount || "?"} words · {c.progressPct}% · ⭐{" "}
                        {c.stars}
                      </Text>
                    </View>
                  ))
                ) : (
                  l1!.categories.map((c) => (
                    <View key={`${c.group}-${c.label}`} style={styles.catRow}>
                      <Text style={styles.catTitle}>
                        {c.emoji} {c.label}
                      </Text>
                      <Text style={styles.meta}>
                        {c.group} · words {c.wordsLearned} · ⭐ {c.stars}
                        {c.completed ? " · done" : ""}
                      </Text>
                    </View>
                  ))
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Recent activity</Text>
                {!dashboard?.history?.length ? (
                  <Text style={styles.meta}>No sessions yet.</Text>
                ) : (
                  dashboard.history.slice(0, 8).map((h) => (
                    <Text key={h.sessionId} style={styles.meta}>
                      {h.category.emoji} {h.category.label} · {h.activityType} · ✅{" "}
                      {h.correctAnswers}/❌ {h.incorrectAnswers} · {h.accuracy}% ·{" "}
                      {h.status}
                    </Text>
                  ))
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Achievements</Text>
                {!(
                  dashboard?.achievements?.some((a) => a.unlocked) ||
                  l1?.achievements?.length
                ) ? (
                  <Text style={styles.meta}>No achievements earned yet.</Text>
                ) : dashboard?.achievements?.length ? (
                  dashboard.achievements
                    .filter((a) => a.unlocked)
                    .map((a) => (
                      <Text key={a.code} style={styles.meta}>
                        {a.title}
                        {a.earnedAt
                          ? ` · ${new Date(a.earnedAt).toLocaleDateString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            })}`
                          : ""}
                      </Text>
                    ))
                ) : (
                  l1!.achievements.map((a) => (
                    <Text key={a.id} style={styles.meta}>
                      {a.title}
                      {a.earnedAt
                        ? ` · ${new Date(a.earnedAt).toLocaleDateString()}`
                        : ""}
                    </Text>
                  ))
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Learning history</Text>
                {!l1?.recentSessions?.length ? (
                  <Text style={styles.meta}>No completed sessions yet.</Text>
                ) : (
                  l1.recentSessions.map((s, i) => (
                    <Text key={`${s.category}-${i}`} style={styles.meta}>
                      {s.emoji} {s.category} · ⭐ {s.stars} · pts {s.points}
                      {s.completedAt ? ` · ${new Date(s.completedAt).toLocaleDateString()}` : ""}
                    </Text>
                  ))
                )}
              </Card>

              <PrimaryButton
                label="Delete child profile"
                color={colors.danger}
                loading={saving}
                onPress={confirmDelete}
              />
            </>
          )}
        </KeyboardScroll>
      </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 36 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, lineHeight: 20 },
  stat: { fontWeight: "800", color: colors.text, fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  catRow: { gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  catTitle: { fontWeight: "700", color: colors.text },
});
