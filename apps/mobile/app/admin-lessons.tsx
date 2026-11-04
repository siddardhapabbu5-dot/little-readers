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

const WEB_LESSONS =
  (process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    "http://localhost:3100") + "/admin/vocabulary/lessons";

type Category = { id: string; label: string };
type Lesson = {
  id: string;
  title: string;
  isPublished: boolean;
  isActive: boolean;
  status: string;
  learningCategory?: { label: string } | null;
  _count?: { vocabItems: number };
};
type LessonList = { total: number; lessons: Lesson[] };

/**
 * Mobile Admin lessons — create/list/publish basics.
 * Full vocab ordering editor: website Manage Lessons.
 */
export default function AdminLessonsScreen() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        apiRequest<LessonList>("/admin/lessons?take=60"),
        apiRequest<Category[]>("/admin/content/categories"),
      ]);
      setLessons(list.lessons);
      setCategories(cats);
      if (!categoryId && cats[0]) setCategoryId(cats[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/admin/lessons", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          learningCategoryId: categoryId || undefined,
          activities: ["LISTEN", "SPELL"],
        }),
      });
      setTitle("");
      setInfo("Draft created. Attach words on the website editor.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/admin/lessons/${id}/publish`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Published.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/admin/lessons/${id}/deactivate`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Deactivated.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Lessons</Title>
          <Text style={styles.note}>
            Create drafts and publish here. Vocab selection/reorder is richest on the
            website{Platform.OS === "web" ? " (:3100)" : ""}.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <Card style={{ gap: 8 }}>
            <TextInput
              style={styles.input}
              placeholder="Lesson title"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.row}>Category</Text>
            {categories.slice(0, 30).map((c) => (
              <SoftButton
                key={c.id}
                label={`${categoryId === c.id ? "✓ " : ""}${c.label}`}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
            <SoftButton label="Create draft" onPress={() => void create()} />
            <SoftButton
              label="Open full editor on website"
              onPress={() => void Linking.openURL(WEB_LESSONS)}
            />
          </Card>

          {lessons.map((l) => (
            <Card key={l.id} style={{ gap: 6 }}>
              <Text style={styles.word}>{l.title}</Text>
              <Text style={styles.row}>
                {l.learningCategory?.label ?? "—"} · words {l._count?.vocabItems ?? 0} ·{" "}
                {l.isPublished ? "published" : l.status.toLowerCase()}
                {!l.isActive ? " · inactive" : ""}
              </Text>
              {!l.isPublished && l.isActive ? (
                <SoftButton label="Publish" onPress={() => void publish(l.id)} />
              ) : null}
              {l.isActive ? (
                <SoftButton label="Deactivate" onPress={() => void deactivate(l.id)} />
              ) : null}
            </Card>
          ))}
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
});
