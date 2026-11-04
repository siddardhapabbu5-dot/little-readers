import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

type Grade = {
  id: string;
  code: string;
  label: string;
  ageMin: number;
  ageMax: number;
  isActive: boolean;
  sortOrder: number;
};
type Level = {
  id: string;
  code: string;
  label: string;
  kind: string;
  isActive: boolean;
  grade?: { code: string } | null;
};
type Group = { id: string; code: string; label: string; isActive: boolean; level?: { code: string } };
type Category = {
  id: string;
  code: string;
  label: string;
  isPublished: boolean;
  group?: { code: string; level?: { code: string } };
};

/**
 * Mobile Admin content structure — same /admin/content APIs as website.
 */
export default function AdminStructureScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<"grades" | "levels" | "groups" | "categories">("grades");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newGrade, setNewGrade] = useState({
    code: "",
    label: "",
    ageMin: "1",
    ageMax: "3",
  });

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [g, l, gr, c] = await Promise.all([
        apiRequest<Grade[]>("/admin/content/grades"),
        apiRequest<Level[]>("/admin/content/levels"),
        apiRequest<Group[]>("/admin/content/groups"),
        apiRequest<Category[]>("/admin/content/categories"),
      ]);
      setGrades(g);
      setLevels(l);
      setGroups(gr);
      setCategories(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function createGrade() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/admin/content/grades", {
        method: "POST",
        body: JSON.stringify({
          code: newGrade.code,
          label: newGrade.label,
          ageMin: Number(newGrade.ageMin),
          ageMax: Number(newGrade.ageMax),
        }),
      });
      setInfo("Grade created");
      setNewGrade({ code: "", label: "", ageMin: "1", ageMax: "3" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGrade(g: Grade) {
    try {
      if (g.isActive) {
        await apiRequest(`/admin/content/grades/${g.id}/deactivate`, {
          method: "POST",
          body: "{}",
        });
      } else {
        await apiRequest(`/admin/content/grades/${g.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function toggleLevel(l: Level) {
    try {
      if (l.isActive) {
        await apiRequest(`/admin/content/levels/${l.id}/deactivate`, {
          method: "POST",
          body: "{}",
        });
      } else {
        await apiRequest(`/admin/content/levels/${l.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function toggleCategory(c: Category) {
    try {
      if (c.isPublished) {
        await apiRequest(`/admin/content/categories/${c.id}/deactivate`, {
          method: "POST",
          body: "{}",
        });
      } else {
        await apiRequest(`/admin/content/categories/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isPublished: true }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Content structure</Title>
          <Text style={styles.note}>
            Same APIs as website Admin. Full create forms for levels/groups/categories are on the
            website; phone supports create grade + activate/deactivate.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <View style={styles.tabs}>
            {(["grades", "levels", "groups", "categories"] as const).map((t) => (
              <SoftButton
                key={t}
                label={t}
                active={tab === t}
                onPress={() => setTab(t)}
              />
            ))}
          </View>

          {tab === "grades" ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Create grade</Text>
              <TextInput
                style={styles.input}
                placeholder="CODE"
                autoCapitalize="characters"
                value={newGrade.code}
                onChangeText={(code) => setNewGrade({ ...newGrade, code })}
              />
              <TextInput
                style={styles.input}
                placeholder="Label"
                value={newGrade.label}
                onChangeText={(label) => setNewGrade({ ...newGrade, label })}
              />
              <TextInput
                style={styles.input}
                placeholder="Age min"
                keyboardType="number-pad"
                value={newGrade.ageMin}
                onChangeText={(ageMin) => setNewGrade({ ...newGrade, ageMin })}
              />
              <TextInput
                style={styles.input}
                placeholder="Age max"
                keyboardType="number-pad"
                value={newGrade.ageMax}
                onChangeText={(ageMax) => setNewGrade({ ...newGrade, ageMax })}
              />
              <SoftButton label="Create grade" onPress={() => void createGrade()} />
              {grades.map((g) => (
                <View key={g.id} style={styles.rowItem}>
                  <Text style={styles.rowTitle}>
                    {g.code} · {g.label} · {g.ageMin}–{g.ageMax}
                  </Text>
                  <SoftButton
                    label={g.isActive ? "Deactivate" : "Activate"}
                    onPress={() => void toggleGrade(g)}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {tab === "levels" ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Levels</Text>
              {levels.map((l) => (
                <View key={l.id} style={styles.rowItem}>
                  <Text style={styles.rowTitle}>
                    {l.code} · {l.label} · {l.kind} · {l.grade?.code ?? "—"}
                  </Text>
                  <SoftButton
                    label={l.isActive ? "Deactivate" : "Activate"}
                    onPress={() => void toggleLevel(l)}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {tab === "groups" ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Groups</Text>
              {groups.map((g) => (
                <Text key={g.id} style={styles.meta}>
                  {g.level?.code}/{g.code} — {g.label}
                  {g.isActive ? "" : " (inactive)"}
                </Text>
              ))}
              <Text style={styles.meta}>Create/edit groups on website Admin → Manage Groups.</Text>
            </Card>
          ) : null}

          {tab === "categories" ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Categories</Text>
              {categories.map((c) => (
                <View key={c.id} style={styles.rowItem}>
                  <Text style={styles.rowTitle}>
                    {c.group?.level?.code}/{c.group?.code}/{c.code} — {c.label}
                  </Text>
                  <SoftButton
                    label={c.isPublished ? "Unpublish" : "Publish"}
                    onPress={() => void toggleCategory(c)}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          <SoftButton label="Refresh" onPress={() => void load()} />
          <SoftButton label="Dictionary → Grades" onPress={() => router.push("/admin-dictionary")} />
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
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  rowItem: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { fontWeight: "700", color: colors.text },
  meta: { color: colors.textMuted, lineHeight: 18 },
});
