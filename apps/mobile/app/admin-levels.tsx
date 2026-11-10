import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ScrollView as ScrollViewType,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { Card, ErrorText, Field, KeyboardScroll, PrimaryButton, SoftButton, Title } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";

type Level = {
  id: string;
  code: string;
  label: string;
  startGrade: number | null;
  endGrade: number | null;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  isPublished: boolean;
  schoolGrades?: Array<{ id: string; label: string; gradeNumber: number | null }>;
};

/** Reference mapping for Academic Setup. */
const GRADE_RANGE_REFERENCE = [
  { label: "Level-1", code: "LEVEL_1", start: 1, end: 3 },
  { label: "Level-2", code: "LEVEL_2", start: 4, end: 6 },
  { label: "Level-3", code: "LEVEL_3", start: 7, end: 12 },
] as const;

const GRADE_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

type LevelForm = {
  id?: string;
  code: string;
  label: string;
  startGrade: number;
  endGrade: number;
  description: string;
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

function GradePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.gradeGrid}>
        {GRADE_OPTIONS.map((n) => (
          <Pressable
            key={`${label}-${n}`}
            onPress={() => onChange(n)}
            style={[styles.gradeChip, value === n && styles.gradeChipOn]}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n}`}
          >
            <Text
              style={[
                styles.gradeChipText,
                value === n && styles.gradeChipTextOn,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function AdminLevelsScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollViewType>(null);
  const [rows, setRows] = useState<Level[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "published">("all");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<LevelForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Do not call /ensure-defaults here — that used to re-create G1–G12
      // every time Levels opened and made deleted grades reappear on Dashboard.
      const data = await apiRequest<Level[]>("/admin/academic/levels");
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load levels");
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
      if (filter === "active" && !r.isActive) return false;
      if (filter === "published" && !r.isPublished) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) || r.code.toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter]);

  function openAddForm(preset?: (typeof GRADE_RANGE_REFERENCE)[number]) {
    setError(null);
    setInfo(null);
    setForm({
      code: preset?.code ?? "",
      label: preset?.label ?? "",
      startGrade: preset?.start ?? 1,
      endGrade: preset?.end ?? 3,
      description: preset
        ? `Grades ${preset.start} to ${preset.end}`
        : "",
    });
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }

  async function save() {
    if (!form) return;
    if (!form.id && !form.code.trim()) {
      setError("Level code is required (e.g. LEVEL_1).");
      return;
    }
    if (!form.label.trim()) {
      setError("Level name is required.");
      return;
    }
    if (form.startGrade > form.endGrade) {
      setError("Starting grade cannot exceed ending grade.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const preview = await apiRequest<{
        safe: boolean;
        warning: string | null;
      }>("/admin/academic/levels/preview-range", {
        method: "POST",
        body: JSON.stringify({
          levelId: form.id,
          startGrade: form.startGrade,
          endGrade: form.endGrade,
        }),
      });
      if (!preview.safe) {
        setError(
          "Grade range conflicts with another active level. Adjust starting/ending grade."
        );
        setBusy(false);
        return;
      }
      if (preview.warning) setInfo(preview.warning);

      if (form.id) {
        await apiRequest(`/admin/academic/levels/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: form.label.trim(),
            startGrade: form.startGrade,
            endGrade: form.endGrade,
            description: form.description.trim() || null,
          }),
        });
      } else {
        await apiRequest("/admin/academic/levels", {
          method: "POST",
          body: JSON.stringify({
            code: form.code.trim().toUpperCase(),
            label: form.label.trim(),
            startGrade: form.startGrade,
            endGrade: form.endGrade,
            description: form.description.trim() || undefined,
            isPublished: false,
            isActive: true,
          }),
        });
      }
      setForm(null);
      await load();
      setInfo("Level saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardScroll
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SoftButton
            label="← Back"
            onPress={() => router.replace("/admin-settings")}
          />
          <Title>Levels</Title>
          <Text style={styles.sub}>Academic Setup · Level Management</Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Card style={{ gap: 8 }} color="#F5F3FF">
            <Text style={styles.cardTitle}>Grade range reference</Text>
            <View style={styles.refHeader}>
              <Text style={[styles.refCell, styles.refHead]}>Level</Text>
              <Text style={[styles.refCell, styles.refHead]}>Grade</Text>
            </View>
            {GRADE_RANGE_REFERENCE.map((r) => (
              <View key={r.code} style={styles.refRow}>
                <Text style={styles.refCell}>{r.label}</Text>
                <Text style={styles.refCell}>
                  {r.start} to {r.end}
                </Text>
              </View>
            ))}
          </Card>

          <Field label="Search" value={q} onChangeText={setQ} />
          <View style={styles.filters}>
            {(["all", "active", "published"] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, filter === f && styles.chipOn]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filter === f && styles.chipTextOn,
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            label="+ Add Level"
            onPress={() => openAddForm()}
          />

          {form ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>
                {form.id ? "Edit Level" : "Add Level"}
              </Text>

              {!form.id ? (
                <>
                  <Text style={styles.fieldLabel}>
                    Quick fill from reference
                  </Text>
                  <View style={styles.filters}>
                    {GRADE_RANGE_REFERENCE.map((p) => (
                      <Pressable
                        key={p.code}
                        onPress={() => openAddForm(p)}
                        style={[
                          styles.chip,
                          form.code === p.code &&
                            form.startGrade === p.start &&
                            styles.chipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            form.code === p.code &&
                              form.startGrade === p.start &&
                              styles.chipTextOn,
                          ]}
                        >
                          {p.label} ({p.start}–{p.end})
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Field
                    label="Level Code *"
                    value={form.code}
                    onChangeText={(v) =>
                      setForm({ ...form, code: v.toUpperCase() })
                    }
                    autoCapitalize="characters"
                    placeholder="LEVEL_1"
                  />
                </>
              ) : null}

              <Field
                label="Level Name *"
                value={form.label}
                onChangeText={(v) => setForm({ ...form, label: v })}
                placeholder="Level-1"
              />

              <GradePicker
                label="Starting Grade *"
                value={form.startGrade}
                onChange={(n) =>
                  setForm({
                    ...form,
                    startGrade: n,
                    endGrade: Math.max(n, form.endGrade),
                  })
                }
              />
              <GradePicker
                label="Ending Grade *"
                value={form.endGrade}
                onChange={(n) =>
                  setForm({
                    ...form,
                    endGrade: n,
                    startGrade: Math.min(n, form.startGrade),
                  })
                }
              />
              <Text style={styles.meta}>
                Selected range: Grade {form.startGrade} to {form.endGrade}
              </Text>

              <Field
                label="Description"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                placeholder="Optional"
              />

              <PrimaryButton
                label={busy ? "Saving…" : form.id ? "Update Level" : "Create Level"}
                loading={busy}
                onPress={() => void save()}
              />
              <SoftButton label="Cancel" onPress={() => setForm(null)} />
            </Card>
          ) : null}

          {loading ? (
            <ActivityIndicator color={adminColors.primary} />
          ) : (
            filtered.map((r) => (
              <View key={r.id} style={[styles.row, shadow.soft]}>
                <Text style={styles.cardTitle}>
                  {r.label} · {r.code}
                </Text>
                <Text style={styles.meta}>
                  Grades {r.startGrade ?? "?"}–{r.endGrade ?? "?"} ·{" "}
                  {r.isActive ? "Active" : "Inactive"} ·{" "}
                  {r.isPublished ? "Published" : "Draft"}
                </Text>
                <Text style={styles.meta}>
                  School grades:{" "}
                  {(r.schoolGrades ?? [])
                    .map((g) => g.gradeNumber ?? g.label)
                    .join(", ") || "—"}
                </Text>
                <View style={styles.actions}>
                  <SoftButton
                    label="Edit"
                    onPress={() => {
                      setForm({
                        id: r.id,
                        code: r.code,
                        label: r.label,
                        startGrade: r.startGrade ?? 1,
                        endGrade: r.endGrade ?? 1,
                        description: r.description ?? "",
                      });
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                  />
                  <SoftButton
                    label={r.isPublished ? "Unpublish" : "Publish"}
                    onPress={() =>
                      void apiRequest(
                        `/admin/academic/levels/${r.id}/publish?published=${
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
                            `/admin/academic/levels/${r.id}/deactivate`,
                            { method: "POST", body: "{}" }
                          )
                        : apiRequest(`/admin/academic/levels/${r.id}`, {
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
                        "Delete level?",
                        "If in use, it will be archived instead.",
                        () =>
                          void apiRequest(`/admin/academic/levels/${r.id}`, {
                            method: "DELETE",
                          }).then(load)
                      )
                    }
                  />
                </View>
              </View>
            ))
          )}
        </KeyboardScroll>
        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background },
  content: { padding: 16, gap: 10, paddingBottom: 100 },
  sub: { color: adminColors.textSecondary, fontWeight: "600" },
  info: { color: adminColors.primary, fontWeight: "700" },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEE",
  },
  chipOn: { backgroundColor: adminColors.primary },
  chipText: { fontWeight: "700", color: "#111", textTransform: "capitalize" },
  chipTextOn: { color: "#fff" },
  row: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: 12,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", fontSize: 16, color: adminColors.text },
  meta: { color: adminColors.textSecondary, fontWeight: "600", fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fieldLabel: {
    fontWeight: "700",
    color: adminColors.text,
    fontSize: 13,
  },
  gradeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gradeChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F5",
    borderWidth: 1,
    borderColor: "#E4E4E7",
  },
  gradeChipOn: {
    backgroundColor: adminColors.primary,
    borderColor: adminColors.primary,
  },
  gradeChipText: { fontWeight: "800", color: "#18181B" },
  gradeChipTextOn: { color: "#fff" },
  refHeader: { flexDirection: "row", gap: 8 },
  refRow: { flexDirection: "row", gap: 8 },
  refCell: { flex: 1, fontWeight: "600", color: adminColors.text, fontSize: 13 },
  refHead: { fontWeight: "800" },
});
