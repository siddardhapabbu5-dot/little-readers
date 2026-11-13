import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { Card, ErrorText, KeyboardScroll, SoftButton, Title, LoadingSlot } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { KIDS_STARTER_WORDS } from "../data/kids-starter-words";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, apiUpload, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
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
  validCount?: number;
  errorCount?: number;
};

type PickedFile = {
  name: string;
  uri?: string;
  blob?: Blob;
  mime: string;
};

async function pickDictionaryFile(): Promise<PickedFile | null> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
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

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/plain",
      "application/json",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "*/*",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    name: asset.name || "dictionary.csv",
    uri: asset.uri,
    mime: asset.mimeType || "application/octet-stream",
  };
}

/**
 * Phone Admin dictionary upload → classify → approve → publish.
 * Same API as website Admin Dictionary.
 */
export default function AdminDictionaryScreen() {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [sourceName, setSourceName] = useState("LEARN WISE Kids Starter");
  const [licence, setLicence] = useState(
    "Project-owned sample template for LEARN WISE"
  );
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canDestroy, setCanDestroy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getUser<{ role: string }>().then((u) => setCanDestroy(u?.role === "SUPER_ADMIN"));
    }, [])
  );

  const loadPending = useCallback(async () => {
    const data = await apiRequest<Assignment[]>(
      "/admin/dictionary/assignments?status=PENDING&take=200"
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
    try {
      const file = await pickDictionaryFile();
      if (!file) return;
      setPicked(file);
      setInfo(`Selected ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open file picker");
    }
  }

  async function uploadPicked() {
    if (!picked) {
      setError("Pick a dictionary file first");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const form = new FormData();
      if (picked.blob) {
        form.append("file", picked.blob, picked.name);
      } else if (picked.uri) {
        form.append("file", {
          uri: picked.uri,
          name: picked.name,
          type: picked.mime,
        } as unknown as Blob);
      } else {
        throw new Error("No file data");
      }
      form.append("sourceName", sourceName.trim() || "LEARN WISE Kids Starter");
      form.append(
        "licence",
        licence.trim() || "Project-owned sample template for LEARN WISE"
      );

      const preview = await apiUpload<BatchInfo>(
        "/admin/dictionary/uploads/preview",
        form
      );
      setBatch(preview);
      if (!preview.validCount) {
        throw new Error(
          `No valid rows (${preview.errorCount ?? 0} invalid). Fix the file and preview again.`
        );
      }
      const confirmed = await apiRequest<BatchInfo>(
        `/admin/dictionary/uploads/confirm/${preview.id}`,
        { method: "POST", body: "{}" }
      );
      setBatch(confirmed);
      setInfo(
        `Imported after preview. Entries ${confirmed.entryCount}, new senses ${confirmed.senseCount}. Invalid rows reported: ${preview.errorCount ?? 0}. Tap Classify next.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadKidsStarter() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<BatchInfo>("/admin/dictionary/uploads/inline", {
        method: "POST",
        body: JSON.stringify({
          sourceName: sourceName.trim() || "LEARN WISE Kids Starter",
          licence:
            licence.trim() || "Project-owned sample template for LEARN WISE",
          filename: "learn-wise-kids-dictionary-template.csv",
          rows: KIDS_STARTER_WORDS,
        }),
      });
      setBatch(data);
      setPicked(null);
      setInfo(
        `Kids starter uploaded (${data.entryCount} entries). Tap Classify, then Approve all + Publish all.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Starter upload failed");
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
      setInfo("Classification done. Review pending, then Approve all / Publish all.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Classify failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(
    id: string,
    action: "approve" | "reject" | "publish" | "unpublish"
  ) {
    setBusy(true);
    setError(null);
    try {
      if (action === "publish") {
        await apiRequest(`/admin/dictionary/assignments/${id}/approve`, {
          method: "POST",
          body: "{}",
        });
      }
      await apiRequest(`/admin/dictionary/assignments/${id}/${action}`, {
        method: "POST",
        body: "{}",
      });
      await loadPending();
      setInfo(
        action === "unpublish"
          ? "Unpublished — dictionary entry kept; kids word hidden."
          : `${action} saved — only approved+published words appear in Kids Zone.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulk(action: "approve" | "publish") {
    if (!assignments.length) {
      setError("No pending suggestions");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ids = assignments.map((a) => a.id);
      const path =
        action === "approve"
          ? "/admin/dictionary/assignments/bulk-approve"
          : "/admin/dictionary/assignments/bulk-publish";
      const data = await apiRequest<{ updated: number; failed: number }>(path, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      await loadPending();
      setInfo(
        `${action}: ${data.updated} ok` +
          (data.failed ? `, ${data.failed} failed` : "")
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Bulk ${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  function confirmClearOldWords() {
    const message =
      "Deletes all published kids words so you can replace them with the new dictionary. Dictionary upload history is kept.";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Clear old vocabulary?\n\n${message}`)) {
        void clearOldWords();
      }
      return;
    }
    Alert.alert("Clear old vocabulary?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all words",
        style: "destructive",
        onPress: () => void clearOldWords(),
      },
    ]);
  }

  async function clearOldWords() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<{ words: number; attempts: number }>(
        "/admin/vocabulary/words/clear-all",
        {
          method: "POST",
          body: JSON.stringify({ confirm: "DELETE_ALL_WORDS" }),
        }
      );
      setInfo(`Cleared ${data.words} old words. Upload kids starter next.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Dictionary → Grades</Title>
          <Text style={styles.note}>
            Mixed word list + classifier only — not Google photos. Words go only into
            matching categories that already exist (fruits need a Fruits category). For
            one topic (Family / Fruits), use Vocabulary → Upload CSV instead.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          <LoadingSlot active={busy} />

          {canDestroy ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>0. Replace old words</Text>
              <Text style={styles.meta}>
                Clear previous published vocabulary before loading the kids starter.
              </Text>
              <SoftButton label="Clear old vocabulary words" onPress={confirmClearOldWords} />
            </Card>
          ) : null}

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>1. Upload dictionary</Text>
            <Text style={styles.meta}>Source name</Text>
            <TextInput
              style={styles.input}
              value={sourceName}
              onChangeText={setSourceName}
              placeholder="LEARN WISE Kids Starter"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.meta}>Licence</Text>
            <TextInput
              style={styles.input}
              value={licence}
              onChangeText={setLicence}
              placeholder="Project-owned sample…"
              placeholderTextColor={colors.textMuted}
            />
            <SoftButton
              label="Upload kids starter (50 words)"
              onPress={() => void uploadKidsStarter()}
            />
            <Text style={styles.meta}>Or pick your own CSV / XLSX file</Text>
            <SoftButton label="Pick file from phone" onPress={() => void pickFile()} />
            {picked ? <Text style={styles.meta}>File: {picked.name}</Text> : null}
            <SoftButton label="Upload picked file" onPress={() => void uploadPicked()} />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>2. Classify</Text>
            <SoftButton
              label={
                batch
                  ? `Classify batch ${batch.id.slice(0, 8)}…`
                  : "Classify (after upload)"
              }
              onPress={() => void classify()}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>3. Pending suggestions</Text>
            <View style={styles.row}>
              <SoftButton label="Refresh" onPress={() => void loadPending()} />
              <SoftButton label="Approve all" onPress={() => void bulk("approve")} />
              <SoftButton label="Publish all" onPress={() => void bulk("publish")} />
            </View>
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
                  <SoftButton label="Unpublish" onPress={() => void act(a.id, "unpublish")} />
                  <SoftButton label="Reject" onPress={() => void act(a.id, "reject")} />
                </View>
              </View>
            ))}
          </Card>
        </KeyboardScroll>
        <AdminTabBar />
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#fff",
  },
  item: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  word: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
});
