import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, apiUpload, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

type Assignment = {
  id: string;
  confidenceScore: number;
  difficultyScore: number;
  explanation: string;
  grade: { code: string; label: string };
  category: { label: string };
  sense: { definition: string; entry: { headword: string } };
};

type BatchInfo = {
  id: string;
  entryCount: number;
  senseCount: number;
  status: string;
};

type PickedFile = {
  name: string;
  blob: Blob;
  mime: string;
};

async function pickDictionaryFile(): Promise<PickedFile | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.csv,.tsv,.txt,.xlsx,.xls,.docx,.doc,.pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        name: file.name,
        blob: file,
        mime: file.type || "application/octet-stream",
      });
    };
    input.click();
  });
}

/**
 * Same dictionary → grade flow as website /admin/vocabulary/dictionary.
 * Phone (:8081) and website (:3100) both call API :4100 — data stays shared.
 */
export default function AdminDictionaryScreen() {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPending = useCallback(async () => {
    const data = await apiRequest<Assignment[]>(
      "/admin/dictionary/assignments?status=PENDING&take=40"
    );
    setAssignments(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPending().catch(() => null);
    }, [loadPending])
  );

  async function pickFile() {
    setError(null);
    if (Platform.OS !== "web") {
      setError(
        "File pick works in Expo web (http://localhost:8081). On a physical phone install, use the website Admin → Dictionary, or open this app in the browser."
      );
      return;
    }
    const file = await pickDictionaryFile();
    if (!file) return;
    setPicked(file);
    setInfo(`Selected ${file.name}`);
  }

  async function upload() {
    if (!picked) {
      setError("Pick a dictionary file first");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const form = new FormData();
      form.append("file", picked.blob, picked.name);
      form.append("sourceName", "English-English Dictionary");
      form.append("licence", "provided-by-admin");

      const data = await apiUpload<BatchInfo>("/admin/dictionary/uploads", form);
      setBatch(data);
      setInfo(
        `Uploaded. Entries ${data.entryCount}, new senses ${data.senseCount}. Tap Classify next.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function classify() {
    if (!batch?.id) {
      setError("Upload a dictionary first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/dictionary/imports/${batch.id}/classify`, {
        method: "POST",
        body: "{}",
      });
      await loadPending();
      setInfo("Classification done. Pending list matches the website.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Classify failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "approve" | "reject" | "publish") {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/dictionary/assignments/${id}/${action}`, {
        method: "POST",
        body: "{}",
      });
      await loadPending();
      setInfo(`${action} saved — published words appear in Kids Zone on phone and website.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Dictionary → Grades</Title>
          <Text style={styles.note}>
            Use this phone app (:8081) or the website (:3100). Both talk to the same API
            (:4100), so uploads and publishes stay in sync.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>1. Upload dictionary</Text>
            <Text style={styles.meta}>
              JSON / CSV / XLSX / DOC / PDF — one full English–English file.
            </Text>
            <SoftButton label="Pick file" onPress={() => void pickFile()} />
            {picked ? <Text style={styles.meta}>File: {picked.name}</Text> : null}
            <SoftButton label="Upload to server" onPress={() => void upload()} />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>2. Classify</Text>
            <SoftButton
              label={batch ? `Classify batch ${batch.id.slice(0, 8)}…` : "Classify (after upload)"}
              onPress={() => void classify()}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>3. Pending suggestions</Text>
            <SoftButton label="Refresh" onPress={() => void loadPending()} />
            {!assignments.length ? (
              <Text style={styles.meta}>No pending assignments.</Text>
            ) : null}
            {assignments.map((a) => (
              <View key={a.id} style={styles.item}>
                <Text style={styles.word}>
                  {a.sense.entry.headword} → {a.grade.code}
                </Text>
                <Text style={styles.meta}>{a.category.label}</Text>
                <Text style={styles.meta}>{a.sense.definition}</Text>
                <Text style={styles.meta}>
                  confidence {a.confidenceScore} · difficulty {a.difficultyScore}
                </Text>
                <View style={styles.row}>
                  <SoftButton label="Approve" onPress={() => void act(a.id, "approve")} />
                  <SoftButton label="Publish" onPress={() => void act(a.id, "publish")} />
                  <SoftButton label="Reject" onPress={() => void act(a.id, "reject")} />
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  note: { color: colors.textMuted, lineHeight: 20 },
  info: { color: colors.success, fontWeight: "700" },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  item: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  word: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
});
