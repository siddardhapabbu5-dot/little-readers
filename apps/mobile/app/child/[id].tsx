import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  Title,
} from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import { clearActiveChild, getActiveChild, saveActiveChild } from "../../services/secure";
import { colors } from "../../theme";

type ChildProfile = {
  id: string;
  displayName: string;
  birthYear: number;
  birthDate?: string | null;
  level?: { code: string; label: string } | null;
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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const load = useCallback(async () => {
    if (!childId) {
      setError("Missing child id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, prog] = await Promise.all([
        apiRequest<ChildProfile>(`/children/${childId}`),
        apiRequest<ProgressPayload>(`/children/${childId}/progress`),
      ]);
      setProfile(p);
      setProgress(prog);
      setName(p.displayName);
      setBirthDate(p.birthDate ?? `01/01/${p.birthYear}`);
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
          level: profile?.level?.code ?? "LEVEL_1",
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
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>{profile?.displayName ?? "Child profile"}</Title>
          <ErrorText>{error}</ErrorText>

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
                      Level {profile.level?.label ?? profile.level?.code ?? "—"}
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
                            level: profile.level?.code ?? "LEVEL_1",
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
                            level: profile.level?.code ?? "LEVEL_1",
                          }).then(() => router.push("/(tabs)/learn"))
                        }
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Field label="Display name" value={name} onChangeText={setName} />
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
                <Text style={styles.section}>Learning progress</Text>
                {!l1 ? (
                  <Text style={styles.meta}>No progress data yet.</Text>
                ) : (
                  <>
                    <Text style={styles.stat}>
                      Words {l1.wordsLearned} · Stars {l1.stars} · Points {l1.points}
                    </Text>
                    <Text style={styles.meta}>
                      Categories completed {l1.categoriesCompleted} · Minutes {l1.minutesLearned}
                    </Text>
                  </>
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Categories</Text>
                {!l1?.categories?.length ? (
                  <Text style={styles.meta}>No category progress yet. Start Listen & Spell from Learn.</Text>
                ) : (
                  l1.categories.map((c) => (
                    <View key={`${c.group}-${c.label}`} style={styles.catRow}>
                      <Text style={styles.catTitle}>
                        {c.emoji} {c.label}
                      </Text>
                      <Text style={styles.meta}>
                        {c.group} · words {c.wordsLearned} · ⭐ {c.stars} · pts {c.points}
                        {c.completed ? " · done" : ""}
                      </Text>
                      <Text style={styles.meta}>
                        Listen {c.listenCorrect}/{c.listenAttempts} · Spell {c.spellCorrect}/
                        {c.spellAttempts}
                      </Text>
                    </View>
                  ))
                )}
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={styles.section}>Achievements</Text>
                {!l1?.achievements?.length ? (
                  <Text style={styles.meta}>No achievements earned yet.</Text>
                ) : (
                  l1.achievements.map((a) => (
                    <Text key={a.id} style={styles.meta}>
                      {a.title}
                      {a.earnedAt ? ` · ${new Date(a.earnedAt).toLocaleDateString()}` : ""}
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
        </ScrollView>
      </SafeAreaView>
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
