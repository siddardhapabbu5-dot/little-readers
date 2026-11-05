import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

type Grade = { id: string; code: string; label: string; sortOrder: number };
type Programme = {
  id: string;
  title: string;
  status: string;
  dailyTarget: number;
  startDate: string;
  endDate: string;
  timezone: string;
  grade: { code: string; label: string };
  _count?: { days: number };
};
type ProgrammeDetail = Programme & {
  days: Array<{
    id: string;
    date: string;
    status: string;
    items: Array<{
      id: string;
      vocabularyWord: { id: string; text: string; emoji: string };
    }>;
    logs?: Array<{ id: string; result: string; error: string | null; ranAt: string }>;
  }>;
};

type PublisherJob = {
  id: string;
  status: string;
  dueDate: string;
  attempts: number;
  lastError: string | null;
  day?: { date: string; status: string };
};
type AdminAlertRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminProgrammeScreen() {
  const router = useRouter();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [list, setList] = useState<Programme[]>([]);
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [title, setTitle] = useState("Kids 6-month starter");
  const [gradeId, setGradeId] = useState("");
  const [dailyTarget, setDailyTarget] = useState("1");
  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 6);
    return isoDate(d);
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<PublisherJob[]>([]);
  const [alerts, setAlerts] = useState<AdminAlertRow[]>([]);
  const [editDayId, setEditDayId] = useState<string | null>(null);
  const [editWordIds, setEditWordIds] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [g, programmes, jobRows, alertRows] = await Promise.all([
        apiRequest<Grade[]>("/admin/content/grades"),
        apiRequest<Programme[]>("/admin/programmes"),
        apiRequest<PublisherJob[]>("/admin/publisher/jobs?take=15").catch(() => []),
        apiRequest<AdminAlertRow[]>("/admin/publisher/alerts?take=15").catch(() => []),
      ]);
      const ordered = [...g].sort((a, b) => a.sortOrder - b.sortOrder);
      setGrades(ordered);
      setList(programmes);
      setJobs(Array.isArray(jobRows) ? jobRows : []);
      setAlerts(Array.isArray(alertRows) ? alertRows : []);
      if (!gradeId) {
        const g1 = ordered.find((x) => x.code === "GRADE_1") ?? ordered[0];
        if (g1) setGradeId(g1.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [gradeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<Programme>("/admin/programmes", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          gradeId,
          startDate,
          endDate,
          dailyTarget: Number(dailyTarget) || 1,
        }),
      });
      setInfo("Draft created. Generate schedule next.");
      await load();
      await openDetail(data.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setBusy(true);
    try {
      const data = await apiRequest<ProgrammeDetail>(`/admin/programmes/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Open failed");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!detail) return;
    setBusy(true);
    try {
      const data = await apiRequest<ProgrammeDetail>(
        `/admin/programmes/${detail.id}/generate`,
        { method: "POST", body: "{}" }
      );
      setDetail(data);
      setInfo(`Generated ${data.days.length} days.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!detail) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/programmes/${detail.id}/approve`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Approved. Activate when ready.");
      await openDetail(detail.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmActivate() {
    if (!detail) return;
    const msg =
      "Activate this programme? Future scheduled words hide from students until the Asia/Kolkata publisher releases each day.";
    const run = () => void activate();
    if (Platform.OS === "web") {
      if (window.confirm(msg)) run();
      return;
    }
    Alert.alert("Activate programme?", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Activate", onPress: run },
    ]);
  }

  async function activate() {
    if (!detail) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/programmes/${detail.id}/activate`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Programme ACTIVE. Backend Kolkata publisher will release due days.");
      await openDetail(detail.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Activate failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPublisherOnce() {
    setBusy(true);
    try {
      const data = await apiRequest<{ processed: number; skipped?: boolean; reason?: string }>(
        "/admin/publisher/run-once",
        { method: "POST", body: "{}" }
      );
      setInfo(
        data.skipped
          ? `Publisher ${data.reason ?? "paused"} — no jobs run.`
          : `Publisher processed ${data.processed} day(s).`
      );
      if (detail) await openDetail(detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publisher run failed");
    } finally {
      setBusy(false);
    }
  }

  async function setPublisherStatus(status: "RUNNING" | "PAUSED" | "STOPPED") {
    setBusy(true);
    try {
      await apiRequest("/admin/publisher/config", {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      setInfo(`Publisher ${status}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publisher config failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDayWords() {
    if (!detail || !editDayId) return;
    const vocabularyWordIds = editWordIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!vocabularyWordIds.length) {
      setError("Enter at least one vocabulary word id");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<ProgrammeDetail>(
        `/admin/programmes/days/${editDayId}/words`,
        {
          method: "PUT",
          body: JSON.stringify({ vocabularyWordIds }),
        }
      );
      setDetail(data);
      setEditDayId(null);
      setEditWordIds("");
      setInfo("Day words updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Day edit failed");
    } finally {
      setBusy(false);
    }
  }

  async function markAlertRead(id: string) {
    try {
      await apiRequest(`/admin/publisher/alerts/${id}/read`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Alert update failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Six-month programme</Title>
          <Text style={styles.note}>
            Build a grade calendar from approved words. Backend publisher uses Asia/Kolkata
            (configurable hour). Pause / resume / stop below.
          </Text>
          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Daily publisher</Text>
            <View style={styles.row}>
              <SoftButton label="Run due now" onPress={() => void runPublisherOnce()} />
              <SoftButton label="Pause" onPress={() => void setPublisherStatus("PAUSED")} />
              <SoftButton label="Resume" onPress={() => void setPublisherStatus("RUNNING")} />
              <SoftButton label="Stop" onPress={() => void setPublisherStatus("STOPPED")} />
            </View>
          </Card>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>New draft</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.meta}>Grade</Text>
            <View style={styles.row}>
              {grades.map((g) => (
                <SoftButton
                  key={g.id}
                  label={g.code.replace("_", " ")}
                  active={gradeId === g.id}
                  onPress={() => setGradeId(g.id)}
                />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="Start YYYY-MM-DD"
            />
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="End YYYY-MM-DD"
            />
            <TextInput
              style={styles.input}
              value={dailyTarget}
              onChangeText={setDailyTarget}
              keyboardType="number-pad"
              placeholder="Daily word target"
            />
            <SoftButton label="Create draft" onPress={() => void create()} />
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Programmes</Text>
            {!list.length ? <Text style={styles.meta}>None yet.</Text> : null}
            {list.map((p) => (
              <View key={p.id} style={styles.item}>
                <Text style={styles.word}>
                  {p.title} · {p.grade.code}
                </Text>
                <Text style={styles.meta}>
                  {p.status} · {p._count?.days ?? 0} days · {String(p.startDate).slice(0, 10)} →{" "}
                  {String(p.endDate).slice(0, 10)}
                </Text>
                <SoftButton label="Open" onPress={() => void openDetail(p.id)} />
              </View>
            ))}
          </Card>

          {detail ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>
                {detail.title} · {detail.status}
              </Text>
              <Text style={styles.banner}>
                Asia/Kolkata backend publisher releases SCHEDULED days. Activating hides future
                words until publish. Does not auto-start the next programme.
              </Text>
              <View style={styles.row}>
                <SoftButton label="Generate schedule" onPress={() => void generate()} />
                <SoftButton label="Approve" onPress={() => void approve()} />
                <SoftButton label="Activate" onPress={confirmActivate} />
                <SoftButton label="Close" onPress={() => setDetail(null)} />
              </View>
              {detail.days.slice(0, 14).map((d) => (
                <View key={d.id} style={styles.item}>
                  <Text style={styles.meta}>
                    {String(d.date).slice(0, 10)} · {d.status}
                  </Text>
                  <Text style={styles.meta}>
                    {d.items.map((i) => i.vocabularyWord.text).join(", ") || "(empty)"}
                  </Text>
                  {d.logs?.length ? (
                    <Text style={styles.meta}>
                      History:{" "}
                      {d.logs
                        .slice(0, 3)
                        .map((l) => `${l.result}${l.error ? `(${l.error})` : ""}`)
                        .join(" · ")}
                    </Text>
                  ) : null}
                  <SoftButton
                    label="Edit day words"
                    onPress={() => {
                      setEditDayId(d.id);
                      setEditWordIds(d.items.map((i) => i.vocabularyWord.id).join(", "));
                    }}
                  />
                </View>
              ))}
              {editDayId ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.meta}>Word IDs (comma-separated) for selected day</Text>
                  <TextInput
                    style={styles.input}
                    value={editWordIds}
                    onChangeText={setEditWordIds}
                    autoCapitalize="none"
                  />
                  <SoftButton label="Save day words" onPress={() => void saveDayWords()} />
                </View>
              ) : null}
              {detail.days.length > 14 ? (
                <Text style={styles.meta}>
                  …and {detail.days.length - 14} more days
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Publish jobs</Text>
            {!jobs.length ? <Text style={styles.meta}>No recent jobs.</Text> : null}
            {jobs.slice(0, 8).map((j) => (
              <Text key={j.id} style={styles.meta}>
                {String(j.dueDate).slice(0, 10)} · {j.status} · tries {j.attempts}
                {j.lastError ? ` · ${j.lastError}` : ""}
              </Text>
            ))}
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Admin alerts</Text>
            {!alerts.length ? <Text style={styles.meta}>No alerts.</Text> : null}
            {alerts.slice(0, 8).map((a) => (
              <View key={a.id} style={styles.item}>
                <Text style={styles.word}>
                  {a.isRead ? "" : "● "}
                  {a.title}
                </Text>
                <Text style={styles.meta}>{a.body.slice(0, 140)}</Text>
                {!a.isRead ? (
                  <SoftButton label="Mark read" onPress={() => void markAlertRead(a.id)} />
                ) : null}
              </View>
            ))}
          </Card>

          <SoftButton
            label="Vocabulary hub"
            onPress={() => router.push("/admin-vocabulary" as never)}
          />
        </ScrollView>
        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  info: { color: colors.success, fontWeight: "700" },
  banner: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  word: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#fff",
  },
});
