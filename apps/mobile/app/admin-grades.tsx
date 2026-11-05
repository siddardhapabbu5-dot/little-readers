import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { Card, ErrorText, Field, SoftButton, Title } from "../components/ui";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";

type Level = {
  id: string;
  code: string;
  label: string;
  startGrade: number | null;
  endGrade: number | null;
};
type Grade = {
  id: string;
  code: string;
  label: string;
  gradeNumber: number | null;
  assignedLevelId: string | null;
  assignedLevel?: Level | null;
  isActive: boolean;
  isPublished: boolean;
  description?: string | null;
};

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "OK", style: "destructive", onPress: onYes },
  ]);
}

export default function AdminGradesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Grade[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [q, setQ] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    id?: string;
    code: string;
    label: string;
    gradeNumber: string;
    assignedLevelId: string;
    description: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grades, lvls] = await Promise.all([
        apiRequest<Grade[]>("/admin/academic/grades"),
        apiRequest<Level[]>("/admin/academic/levels"),
      ]);
      setRows(grades.filter((g) => g.gradeNumber != null));
      setLevels(lvls);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (levelFilter !== "all" && r.assignedLevelId !== levelFilter)
        return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.code.toLowerCase().includes(s) ||
        String(r.gradeNumber).includes(s)
      );
    });
  }, [rows, q, levelFilter]);

  async function save() {
    if (!form) return;
    try {
      const body = {
        label: form.label,
        gradeNumber: Number(form.gradeNumber),
        assignedLevelId: form.assignedLevelId,
        description: form.description || null,
        code: form.code,
      };
      if (form.id) {
        await apiRequest(`/admin/academic/grades/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest("/admin/academic/grades", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Grades</Title>
          <Text style={styles.sub}>Academic Setup · Grade Management</Text>
          <ErrorText>{error}</ErrorText>

          <Field label="Search" value={q} onChangeText={setQ} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filters}>
              <Pressable
                onPress={() => setLevelFilter("all")}
                style={[styles.chip, levelFilter === "all" && styles.chipOn]}
              >
                <Text style={styles.chipText}>All levels</Text>
              </Pressable>
              {levels.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => setLevelFilter(l.id)}
                  style={[
                    styles.chip,
                    levelFilter === l.id && styles.chipOn,
                  ]}
                >
                  <Text style={styles.chipText}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <SoftButton
            label="+ Add Grade"
            onPress={() =>
              setForm({
                code: "",
                label: "",
                gradeNumber: "1",
                assignedLevelId: levels[0]?.id ?? "",
                description: "",
              })
            }
          />

          {form ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.cardTitle}>
                {form.id ? "Edit Grade" : "Add Grade"}
              </Text>
              {!form.id ? (
                <Field
                  label="Grade Code"
                  value={form.code}
                  onChangeText={(v) =>
                    setForm({ ...form, code: v.toUpperCase() })
                  }
                />
              ) : null}
              <Field
                label="Grade Name"
                value={form.label}
                onChangeText={(v) => setForm({ ...form, label: v })}
              />
              <Field
                label="Grade Number"
                value={form.gradeNumber}
                onChangeText={(v) => setForm({ ...form, gradeNumber: v })}
                keyboardType="number-pad"
              />
              <Text style={styles.meta}>Assign Level</Text>
              <View style={styles.filters}>
                {levels.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() =>
                      setForm({ ...form, assignedLevelId: l.id })
                    }
                    style={[
                      styles.chip,
                      form.assignedLevelId === l.id && styles.chipOn,
                    ]}
                  >
                    <Text style={styles.chipText}>
                      {l.label} ({l.startGrade}–{l.endGrade})
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Description"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
              />
              <SoftButton label="Save" onPress={() => void save()} />
              <SoftButton label="Cancel" onPress={() => setForm(null)} />
            </Card>
          ) : null}

          {loading ? (
            <ActivityIndicator color={adminColors.primary} />
          ) : (
            filtered.map((r) => (
              <View key={r.id} style={[styles.row, shadow.soft]}>
                <Text style={styles.cardTitle}>
                  {r.label} · #{r.gradeNumber}
                </Text>
                <Text style={styles.meta}>
                  {r.assignedLevel?.label ?? "No level"} ·{" "}
                  {r.isActive ? "Active" : "Inactive"} ·{" "}
                  {r.isPublished ? "Published" : "Draft"}
                </Text>
                <View style={styles.actions}>
                  <SoftButton
                    label="Edit"
                    onPress={() =>
                      setForm({
                        id: r.id,
                        code: r.code,
                        label: r.label,
                        gradeNumber: String(r.gradeNumber ?? 1),
                        assignedLevelId: r.assignedLevelId ?? "",
                        description: r.description ?? "",
                      })
                    }
                  />
                  <SoftButton
                    label={r.isPublished ? "Unpublish" : "Publish"}
                    onPress={() =>
                      void apiRequest(
                        `/admin/academic/grades/${r.id}/publish?published=${
                          r.isPublished ? "0" : "1"
                        }`,
                        { method: "POST", body: "{}" }
                      ).then(load)
                    }
                  />
                  <SoftButton
                    label={r.isActive ? "Deactivate" : "Activate"}
                    onPress={() =>
                      void (r.isActive
                        ? apiRequest(
                            `/admin/academic/grades/${r.id}/deactivate`,
                            { method: "POST", body: "{}" }
                          )
                        : apiRequest(`/admin/academic/grades/${r.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ isActive: true }),
                          })
                      ).then(load)
                    }
                  />
                  <SoftButton
                    label="Delete"
                    onPress={() =>
                      confirm(
                        "Delete grade?",
                        "If in use, it will be archived.",
                        () =>
                          void apiRequest(`/admin/academic/grades/${r.id}`, {
                            method: "DELETE",
                          }).then(load)
                      )
                    }
                  />
                </View>
              </View>
            ))
          )}
        </ScrollView>
        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background },
  content: { padding: 16, gap: 10, paddingBottom: 100 },
  sub: { color: adminColors.textSecondary, fontWeight: "600" },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEE",
  },
  chipOn: { backgroundColor: adminColors.primary },
  chipText: { fontWeight: "700", color: "#111" },
  row: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: 12,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", fontSize: 16, color: adminColors.text },
  meta: { color: adminColors.textSecondary, fontWeight: "600", fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
