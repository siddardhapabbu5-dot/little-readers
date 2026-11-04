import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

const WEB_ADMIN_WORDS =
  process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
  "http://localhost:3100";

type Category = {
  id: string;
  label: string;
  group?: { label?: string; level?: { label?: string; grade?: { code?: string } | null } };
};

type WordRow = {
  id: string;
  text: string;
  meaning: string;
  phonetic: string | null;
  emoji: string;
  difficulty: number;
  sortOrder: number;
  isActive: boolean;
  origin: string;
  categoryId: string;
  category: {
    id: string;
    label: string;
    group: {
      label: string;
      level: {
        label: string;
        grade: { code: string; label: string } | null;
      };
    };
  };
  _count?: { attempts: number };
};

type WordList = { total: number; words: WordRow[] };

/**
 * Mobile Admin word browse / edit / reclassify.
 * Full bulk review stays on the website Admin → Manage Words.
 */
export default function AdminWordsScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [words, setWords] = useState<WordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<WordRow | null>(null);
  const [edit, setEdit] = useState({
    text: "",
    meaning: "",
    phonetic: "",
    emoji: "",
    difficulty: "1",
  });
  const [reclassCategoryId, setReclassCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ take: "60" });
      if (q.trim()) params.set("q", q.trim());
      const [list, cats] = await Promise.all([
        apiRequest<WordList>(`/admin/vocabulary/words?${params}`),
        apiRequest<Category[]>("/admin/content/categories"),
      ]);
      setWords(list.words);
      setTotal(list.total);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [q]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function openWord(w: WordRow) {
    setSelected(w);
    setEdit({
      text: w.text,
      meaning: w.meaning,
      phonetic: w.phonetic ?? "",
      emoji: w.emoji,
      difficulty: String(w.difficulty),
    });
    setReclassCategoryId(w.categoryId);
    setInfo(null);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          text: edit.text,
          meaning: edit.meaning,
          phonetic: edit.phonetic || null,
          emoji: edit.emoji,
          difficulty: Number(edit.difficulty) || 1,
        }),
      });
      setInfo("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}/deactivate`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Deactivated.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  async function reclassify() {
    if (!selected || !reclassCategoryId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}/reclassify`, {
        method: "POST",
        body: JSON.stringify({ categoryId: reclassCategoryId }),
      });
      setInfo("Reclassified (same word id).");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reclassify failed");
    } finally {
      setBusy(false);
    }
  }

  async function openBulkOnWeb() {
    const url = `${WEB_ADMIN_WORDS}/admin/vocabulary/words`;
    try {
      await Linking.openURL(url);
    } catch {
      setInfo(`Open bulk review on website: ${url}`);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Vocabulary words</Title>
          <Text style={styles.note}>
            Browse and edit individual words. Bulk approve/reject/publish is on the website
            Admin → Manage Words ({Platform.OS === "web" ? "localhost:3100" : "shared API"}).
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <Card style={{ gap: 8 }}>
            <TextInput
              style={styles.input}
              placeholder="Search word or meaning"
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
            />
            <SoftButton label="Search" onPress={() => void load()} />
            <SoftButton label="Bulk review on website" onPress={() => void openBulkOnWeb()} />
            <Text style={styles.row}>
              Showing {words.length} of {total}
            </Text>
          </Card>

          {words.map((w) => (
            <Card key={w.id} style={{ gap: 6 }}>
              <Text style={styles.word}>
                {w.emoji} {w.text}
              </Text>
              <Text style={styles.row}>{w.meaning}</Text>
              <Text style={styles.row}>
                {w.category.group.level.grade?.code ?? "—"} / {w.category.label} ·{" "}
                {w.isActive ? "active" : "off"} · attempts {w._count?.attempts ?? 0}
              </Text>
              <SoftButton label="Edit" onPress={() => openWord(w)} />
            </Card>
          ))}

          {selected ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Edit {selected.text}</Text>
              <TextInput
                style={styles.input}
                value={edit.text}
                onChangeText={(t) => setEdit((s) => ({ ...s, text: t }))}
              />
              <TextInput
                style={[styles.input, styles.area]}
                multiline
                value={edit.meaning}
                onChangeText={(t) => setEdit((s) => ({ ...s, meaning: t }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Phonetic"
                placeholderTextColor={colors.textMuted}
                value={edit.phonetic}
                onChangeText={(t) => setEdit((s) => ({ ...s, phonetic: t }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Emoji"
                placeholderTextColor={colors.textMuted}
                value={edit.emoji}
                onChangeText={(t) => setEdit((s) => ({ ...s, emoji: t }))}
              />
              <SoftButton label="Save" onPress={() => void save()} />
              <SoftButton label="Deactivate" onPress={() => void deactivate()} />

              <Text style={styles.section}>Reclassify</Text>
              <Text style={styles.row}>Tap a category below, then Move.</Text>
              {categories.slice(0, 40).map((c) => (
                <SoftButton
                  key={c.id}
                  label={`${reclassCategoryId === c.id ? "✓ " : ""}${c.group?.level?.grade?.code ?? "—"} / ${c.label}`}
                  onPress={() => setReclassCategoryId(c.id)}
                />
              ))}
              <SoftButton label="Move category" onPress={() => void reclassify()} />
              <SoftButton label="Close editor" onPress={() => setSelected(null)} />
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  info: { color: colors.primary, fontSize: 13 },
  section: { fontWeight: "700", color: colors.text, fontSize: 16 },
  word: { fontWeight: "700", color: colors.text, fontSize: 17 },
  row: { color: colors.textMuted, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#fff",
  },
  area: { minHeight: 72, textAlignVertical: "top" },
});
