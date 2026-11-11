import { useCallback, useState } from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { Card, ErrorText, KeyboardScroll, SoftButton, Title, LoadingSlot } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { AdminGradeSelector, useAdminGrade } from "../components/AdminGradeSelector";
import { adminGradeLabel } from "../services/admin-grade";
import { colors } from "../theme";

const WEB_LESSONS =
  (process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    "https://siwiapp.shop") + "/admin/vocabulary/lessons";

type Category = {
  id: string;
  label: string;
  code: string;
  isPublished?: boolean;
  _count?: { words?: number };
  group?: {
    code: string;
    level?: {
      code: string;
      label: string;
      grade?: { code: string; label: string } | null;
    } | null;
  } | null;
};
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

function categoryGradeCode(c: Category) {
  return c.group?.level?.grade?.code ?? "";
}

/**
 * Mobile Admin lessons — create/list/publish basics.
 * Full vocab ordering editor: website Manage Lessons.
 */
export default function AdminLessonsScreen() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [gradeFilter, setGradeFilter] = useAdminGrade();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [grades, cats] = await Promise.all([
        apiRequest<{ id: string; code: string }[]>("/admin/content/grades"),
        apiRequest<Category[]>("/admin/content/categories"),
      ]);
      const gradeId = grades.find((g) => g.code === gradeFilter)?.id;
      const list = gradeId
        ? await apiRequest<LessonList>(`/admin/lessons?take=60&gradeId=${encodeURIComponent(gradeId)}`)
        : { total: 0, lessons: [] };
      setLessons(list.lessons);
      setCategories(cats);
      const preferred = cats.find((c) => categoryGradeCode(c) === gradeFilter);
      setCategoryId((current) => {
        if (current && cats.some((c) => c.id === current && categoryGradeCode(c) === gradeFilter)) {
          return current;
        }
        return preferred?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [gradeFilter]);

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
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Lessons</Title>
          <Text style={styles.note}>
            Lessons stay separate from categories and reuse approved words. Full word
            reorder is on the website{Platform.OS === "web" ? " (:3100)" : ""}.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          <LoadingSlot active={busy} />

          <Card style={{ gap: 8 }}>
            <TextInput
              style={styles.input}
              placeholder="Lesson title"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.row}>Grade</Text>
            <Text style={styles.note}>
              Same topic names exist in each grade (Grade 1–4). Pick a grade first —
              these are not duplicates.
            </Text>
            <AdminGradeSelector
              value={gradeFilter}
              onChange={(code) => {
                setGradeFilter(code);
                const first = categories.find((c) => categoryGradeCode(c) === code);
                setCategoryId(first?.id ?? "");
              }}
            />
            <Text style={styles.row}>Category ({adminGradeLabel(gradeFilter)})</Text>
            {categories
              .filter((c) => categoryGradeCode(c) === gradeFilter)
              .map((c) => {
                const words = c._count?.words ?? 0;
                return (
                  <SoftButton
                    key={c.id}
                    label={`${categoryId === c.id ? "✓ " : ""}${c.label} · ${words} words`}
                    active={categoryId === c.id}
                    onPress={() => setCategoryId(c.id)}
                  />
                );
              })}
            <Text style={styles.row}>Activities</Text>
            <View style={styles.gradeRow}>
              <SoftButton label="✓ Listen" active onPress={() => setInfo("Listen is enabled for lessons")} />
              <SoftButton label="✓ Spell" active onPress={() => setInfo("Spell is enabled for lessons")} />
              <Text style={styles.meta}>
                Matching / Quiz / Revision — Coming soon (not available yet).
              </Text>
            </View>
            <SoftButton label="Create draft" onPress={() => void create()} />
            <SoftButton
              label="Open full editor on website"
              onPress={() => void Linking.openURL(WEB_LESSONS)}
            />
          </Card>

          {lessons.map((l) => (
            <Card key={l.id} style={{ gap: 6 }}>
              <Text style={styles.word}>{l.title}</Text>
              <Text style={styles.meta}>
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
        </KeyboardScroll>
        <AdminTabBar />
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
  row: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  gradeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
