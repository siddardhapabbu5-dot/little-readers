import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, ErrorText, Field, SoftButton, Title } from "../components/ui";
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
  description?: string | null;
  _count?: { levels?: number; assignments?: number };
};
type Level = {
  id: string;
  code: string;
  label: string;
  kind: string;
  isActive: boolean;
  gradeId?: string | null;
  grade?: { id?: string; code: string } | null;
};
type Group = {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  levelId?: string;
  level?: { id?: string; code: string; grade?: { code: string } | null };
};
type Category = {
  id: string;
  code: string;
  label: string;
  emoji?: string | null;
  description?: string | null;
  isPublished: boolean;
  groupId?: string;
  group?: {
    id?: string;
    code: string;
    level?: {
      code: string;
      grade?: { code: string; label?: string } | null;
    } | null;
  };
  _count?: { words?: number; lessons?: number };
};

type Panel =
  | { kind: "create-grade" }
  | { kind: "edit-grade"; id: string }
  | { kind: "view-grade"; id: string }
  | { kind: "create-category" }
  | { kind: "edit-category"; id: string }
  | { kind: "view-category"; id: string }
  | null;

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * Grade-first Academic Structure — reuses /admin/content APIs.
 */
export default function AdminStructureScreen() {
  const router = useRouter();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [gradeForm, setGradeForm] = useState({
    code: "GRADE_5",
    label: "Grade 5",
    ageMin: "10",
    ageMax: "12",
  });
  const [categoryForm, setCategoryForm] = useState({
    label: "",
    code: "",
    emoji: "📚",
    fillStarters: true,
  });

  const sortedGrades = useMemo(
    () =>
      [...grades].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.code.localeCompare(b.code, undefined, { numeric: true });
      }),
    [grades]
  );

  const selectedGrade =
    sortedGrades.find((g) => g.id === selectedGradeId) ?? sortedGrades[0] ?? null;

  const gradeLevels = useMemo(() => {
    if (!selectedGrade) return [];
    return levels.filter(
      (l) =>
        l.gradeId === selectedGrade.id ||
        l.grade?.code === selectedGrade.code ||
        l.grade?.id === selectedGrade.id
    );
  }, [levels, selectedGrade]);

  const activeLevel = useMemo(() => {
    if (!gradeLevels.length) return null;
    if (selectedLevelId) {
      return gradeLevels.find((l) => l.id === selectedLevelId) ?? gradeLevels[0];
    }
    return gradeLevels[0];
  }, [gradeLevels, selectedLevelId]);

  const levelGroups = useMemo(() => {
    if (!activeLevel) return [];
    return groups.filter(
      (g) => g.levelId === activeLevel.id || g.level?.code === activeLevel.code
    );
  }, [groups, activeLevel]);

  const levelCategories = useMemo(() => {
    if (!selectedGrade) return [];
    return categories.filter(
      (c) => c.group?.level?.grade?.code === selectedGrade.code
    );
  }, [categories, selectedGrade]);

  const panelGrade = useMemo(() => {
    if (!panel || (panel.kind !== "edit-grade" && panel.kind !== "view-grade"))
      return null;
    return grades.find((g) => g.id === panel.id) ?? null;
  }, [panel, grades]);

  const panelCategory = useMemo(() => {
    if (
      !panel ||
      (panel.kind !== "edit-category" && panel.kind !== "view-category")
    )
      return null;
    return categories.find((c) => c.id === panel.id) ?? null;
  }, [panel, categories]);

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
      const ordered = [...g].sort((a, b) => a.sortOrder - b.sortOrder);
      const first =
        ordered.find((x) => x.code === "GRADE_1") ?? ordered[0] ?? null;
      setSelectedGradeId((cur) =>
        cur && g.some((x) => x.id === cur) ? cur : first?.id ?? ""
      );
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

  useEffect(() => {
    if (gradeLevels.length === 1 && selectedLevelId !== gradeLevels[0].id) {
      setSelectedLevelId(gradeLevels[0].id);
    }
  }, [gradeLevels, selectedLevelId]);

  useEffect(() => {
    if (!levelGroups.length) {
      setSelectedGroupId("");
      return;
    }
    const last = levelGroups[levelGroups.length - 1].id;
    if (selectedGroupId !== last) setSelectedGroupId(last);
  }, [levelGroups, selectedGroupId]);

  function suggestCategoryCode(label: string) {
    return label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
  }

  function openCreateGrade() {
    const nums = sortedGrades
      .map((g) => Number((g.code.match(/(\d+)/) ?? [])[1]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    setGradeForm({
      code: `GRADE_${n}`,
      label: `Grade ${n}`,
      ageMin: String(Math.min(5 + n, 16)),
      ageMax: String(Math.min(7 + n, 18)),
    });
    setPanel({ kind: "create-grade" });
  }

  function openEditGrade(g: Grade) {
    setSelectedGradeId(g.id);
    setGradeForm({
      code: g.code,
      label: g.label,
      ageMin: String(g.ageMin),
      ageMax: String(g.ageMax),
    });
    setPanel({ kind: "edit-grade", id: g.id });
  }

  function openEditCategory(c: Category) {
    setCategoryForm({
      label: c.label,
      code: c.code,
      emoji: c.emoji ?? "📚",
      fillStarters: false,
    });
    setPanel({ kind: "edit-category", id: c.id });
  }

  async function createGradeWithScaffold() {
    setBusy(true);
    setError(null);
    try {
      const ageMin = Number(gradeForm.ageMin);
      const ageMax = Number(gradeForm.ageMax);
      const code = gradeForm.code.trim().toUpperCase();
      const label = gradeForm.label.trim();
      if (!code || !label) throw new ApiError("Code and label required", 400);
      const grade = await apiRequest<Grade>("/admin/content/grades", {
        method: "POST",
        body: JSON.stringify({
          code,
          label,
          ageMin,
          ageMax,
          isActive: true,
        }),
      });
      const num = (code.match(/(\d+)/) ?? [])[1] ?? "X";
      const level = await apiRequest<Level>("/admin/content/levels", {
        method: "POST",
        body: JSON.stringify({
          code: `LEVEL_${num}`,
          label: `${label} – Ages ${ageMin}–${ageMax}`,
          kind: "GRADE_BAND",
          gradeId: grade.id,
          ageMin,
          ageMax,
          isActive: true,
        }),
      });
      await apiRequest("/admin/content/groups", {
        method: "POST",
        body: JSON.stringify({
          levelId: level.id,
          code: "A",
          label: "Group A",
          isActive: true,
        }),
      });
      setInfo(`Created ${code} with Level ${num} and Group A`);
      setPanel({ kind: "view-grade", id: grade.id });
      await load();
      setSelectedGradeId(grade.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create grade failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveGrade() {
    if (!panel || panel.kind !== "edit-grade") return;
    setBusy(true);
    setError(null);
    try {
      const code = gradeForm.code.trim().toUpperCase();
      const label = gradeForm.label.trim();
      const ageMin = Number(gradeForm.ageMin);
      const ageMax = Number(gradeForm.ageMax);
      if (!code) throw new ApiError("Code required", 400);
      if (!label) throw new ApiError("Label required", 400);
      await apiRequest(`/admin/content/grades/${panel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ code, label, ageMin, ageMax }),
      });
      setInfo(`Updated ${code}`);
      setPanel({ kind: "view-grade", id: panel.id });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update grade failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeGrade(g: Grade) {
    confirmAction(
      "Delete grade?",
      `${g.label} (${g.code}) will be permanently deleted along with its levels, groups, categories, and words.`,
      "Delete",
      () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            await apiRequest(`/admin/content/grades/${g.id}?force=1`, {
              method: "DELETE",
            });
            setInfo(`Deleted ${g.code} and its categories/words`);
            setPanel(null);
            setSelectedGradeId("");
            await load();
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Delete grade failed"
            );
          } finally {
            setBusy(false);
          }
        })();
      }
    );
  }

  async function createCategory() {
    setBusy(true);
    setError(null);
    try {
      const label = categoryForm.label.trim();
      const code =
        categoryForm.code.trim().toUpperCase() || suggestCategoryCode(label);
      const groupId = selectedGroupId || levelGroups[0]?.id;
      if (!groupId) {
        throw new ApiError(
          "This grade needs a level/group first. Create the grade with scaffold, or pick a grade that has Group A.",
          400
        );
      }
      if (!label || !code) throw new ApiError("Label required", 400);
      const created = await apiRequest<
        Category & {
          starterFill?: {
            created: number;
            theme: string | null;
            skipped: number;
            skippedReason?: string;
          };
        }
      >("/admin/content/categories", {
        method: "POST",
        body: JSON.stringify({
          groupId,
          code,
          label,
          emoji: categoryForm.emoji.trim() || "📚",
          isPublished: true,
          fillStarters: categoryForm.fillStarters,
        }),
      });
      const fill = created.starterFill;
      if (fill && fill.created > 0) {
        setInfo(`Created ${label} + ${fill.created} starter words`);
      } else if (fill?.skippedReason === "NO_STARTER_PACK") {
        setInfo(
          `Created ${label}. Use Upload to add words (no auto pack for this name).`
        );
      } else {
        setInfo(`Created category ${label}`);
      }
      setCategoryForm({
        label: "",
        code: "",
        emoji: "📚",
        fillStarters: true,
      });
      setPanel({ kind: "view-category", id: created.id });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create category failed");
    } finally {
      setBusy(false);
    }
  }

  async function fillStartersForCategory(categoryId: string) {
    setBusy(true);
    setError(null);
    try {
      const fill = await apiRequest<{
        created: number;
        skipped: number;
        theme: string;
        totalInPack: number;
      }>(`/admin/content/categories/${categoryId}/fill-starters`, {
        method: "POST",
        body: "{}",
      });
      setInfo(
        `Added ${fill.created} starter words (${fill.theme}). Skipped ${fill.skipped} existing.`
      );
      await load();
    } catch (err) {
      // Soft message — custom categories use Upload instead.
      setInfo(
        err instanceof ApiError
          ? err.message
          : "No starter pack for this name — use Upload to add words."
      );
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory() {
    if (!panel || panel.kind !== "edit-category") return;
    setBusy(true);
    setError(null);
    try {
      const label = categoryForm.label.trim();
      if (!label) throw new ApiError("Label required", 400);
      await apiRequest(`/admin/content/categories/${panel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label,
        }),
      });
      setInfo(`Updated ${label}`);
      setPanel({ kind: "view-category", id: panel.id });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update category failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(c: Category) {
    const wordN = c._count?.words ?? 0;
    confirmAction(
      "Delete category?",
      wordN > 0
        ? `${c.label} has ${wordN} word(s). This will permanently delete the category AND those words.`
        : `${c.label} (${c.code}) will be permanently deleted.`,
      "Delete",
      () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            await apiRequest(
              `/admin/content/categories/${c.id}?force=1`,
              { method: "DELETE" }
            );
            setInfo(`Deleted ${c.label}${wordN ? ` and ${wordN} words` : ""}`);
            setPanel(null);
            await load();
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Delete category failed"
            );
          } finally {
            setBusy(false);
          }
        })();
      }
    );
  }

  async function toggleGrade(g: Grade) {
    const act = g.isActive ? "deactivate" : "activate";
    confirmAction(`${act} grade?`, `${g.label} (${g.code})`, act, () => {
      void (async () => {
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
          setInfo(`Grade ${g.code} ${act}d`);
          await load();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Update failed");
        }
      })();
    });
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

  function viewWordsForCategory(c: Category) {
    const gradeCode = c.group?.level?.grade?.code ?? selectedGrade?.code ?? "";
    const qs = new URLSearchParams();
    if (gradeCode) qs.set("grade", gradeCode);
    qs.set("categoryId", c.id);
    router.push(`/admin-words?${qs.toString()}` as never);
  }

  function viewWordsForGrade(g: Grade) {
    router.push(`/admin-words?grade=${encodeURIComponent(g.code)}` as never);
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <SoftButton
            label="← Back"
            onPress={() => router.replace("/admin")}
          />
          <Title>Academic Structure</Title>
          <Text style={styles.note}>
            Grade → Level → Group → Category. Create, view, edit, or delete grades and
            categories.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          <View style={styles.rowBetween}>
            <Text style={styles.section}>Grades</Text>
            <SoftButton
              label={panel?.kind === "create-grade" ? "Hide" : "+ Create grade"}
              onPress={() => {
                if (panel?.kind === "create-grade") setPanel(null);
                else openCreateGrade();
              }}
            />
          </View>

          {panel?.kind === "create-grade" ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>New grade</Text>
              <Text style={styles.meta}>
                Creates the grade plus a matching level and Group A so you can add
                categories right away.
              </Text>
              <Field
                label="Code"
                autoCapitalize="characters"
                value={gradeForm.code}
                onChangeText={(code) => setGradeForm((f) => ({ ...f, code }))}
                placeholder="GRADE_5"
              />
              <Field
                label="Label"
                value={gradeForm.label}
                onChangeText={(label) => setGradeForm((f) => ({ ...f, label }))}
                placeholder="Grade 5"
              />
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Age min"
                    keyboardType="number-pad"
                    value={gradeForm.ageMin}
                    onChangeText={(ageMin) =>
                      setGradeForm((f) => ({ ...f, ageMin }))
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Age max"
                    keyboardType="number-pad"
                    value={gradeForm.ageMax}
                    onChangeText={(ageMax) =>
                      setGradeForm((f) => ({ ...f, ageMax }))
                    }
                  />
                </View>
              </View>
              <SoftButton
                label={busy ? "Creating…" : "Create grade"}
                onPress={() => {
                  if (!busy) void createGradeWithScaffold();
                }}
              />
            </Card>
          ) : null}

          {panel?.kind === "edit-grade" && panelGrade ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>Edit {panelGrade.code}</Text>
              <Field
                label="Code"
                value={gradeForm.code}
                autoCapitalize="characters"
                autoFocus
                onChangeText={(code) =>
                  setGradeForm((f) => ({ ...f, code: code.toUpperCase() }))
                }
              />
              <Field
                label="Label"
                value={gradeForm.label}
                onChangeText={(label) => setGradeForm((f) => ({ ...f, label }))}
              />
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Age min"
                    keyboardType="number-pad"
                    value={gradeForm.ageMin}
                    onChangeText={(ageMin) =>
                      setGradeForm((f) => ({ ...f, ageMin }))
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Age max"
                    keyboardType="number-pad"
                    value={gradeForm.ageMax}
                    onChangeText={(ageMax) =>
                      setGradeForm((f) => ({ ...f, ageMax }))
                    }
                  />
                </View>
              </View>
              <View style={styles.tabs}>
                <SoftButton
                  label={busy ? "Saving…" : "Save"}
                  onPress={() => {
                    if (!busy) void saveGrade();
                  }}
                />
                <SoftButton label="Cancel" onPress={() => setPanel(null)} />
              </View>
            </Card>
          ) : null}

          {panel?.kind === "view-grade" && panelGrade ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>
                View · {panelGrade.label} ({panelGrade.code})
              </Text>
              <Text style={styles.meta}>
                Ages {panelGrade.ageMin}–{panelGrade.ageMax} ·{" "}
                {panelGrade.isActive ? "Active" : "Inactive"} · sort{" "}
                {panelGrade.sortOrder}
              </Text>
              <Text style={styles.meta}>
                Levels: {panelGrade._count?.levels ?? gradeLevels.length} · Assignments:{" "}
                {panelGrade._count?.assignments ?? 0} · Categories:{" "}
                {
                  categories.filter(
                    (c) => c.group?.level?.grade?.code === panelGrade.code
                  ).length
                }
              </Text>
              {gradeLevels.length ? (
                <Text style={styles.meta}>
                  Level path:{" "}
                  {gradeLevels.map((l) => l.code).join(", ")}
                </Text>
              ) : (
                <Text style={styles.meta}>No level linked yet.</Text>
              )}
              <View style={styles.tabs}>
                <SoftButton
                  label="Edit"
                  onPress={() => openEditGrade(panelGrade)}
                />
                <SoftButton
                  label="View words"
                  onPress={() => viewWordsForGrade(panelGrade)}
                />
                <SoftButton
                  label={panelGrade.isActive ? "Deactivate" : "Activate"}
                  onPress={() => void toggleGrade(panelGrade)}
                />
                <SoftButton
                  label="Delete"
                  onPress={() => void removeGrade(panelGrade)}
                />
                <SoftButton label="Close" onPress={() => setPanel(null)} />
              </View>
            </Card>
          ) : null}

          <Text style={styles.gradeAges}>
            {sortedGrades.filter((g) => g.isActive).length} active grade
            {sortedGrades.filter((g) => g.isActive).length === 1 ? "" : "s"}
            {sortedGrades.some((g) => !g.isActive)
              ? ` · ${sortedGrades.filter((g) => !g.isActive).length} inactive`
              : ""}
          </Text>
          <View style={styles.gradeGrid}>
            {sortedGrades.map((g) => {
              const on = selectedGrade?.id === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    setSelectedGradeId(g.id);
                    setSelectedLevelId("");
                    setPanel({ kind: "view-grade", id: g.id });
                  }}
                  style={[styles.gradeCard, on && styles.gradeCardOn]}
                >
                  <Text style={[styles.gradeCode, on && styles.gradeOnText]}>
                    {g.code}
                  </Text>
                  <Text style={[styles.gradeLabel, on && styles.gradeOnText]}>
                    {g.label}
                  </Text>
                  <Text style={[styles.gradeAges, on && styles.gradeOnText]}>
                    Ages {g.ageMin}–{g.ageMax}
                  </Text>
                  <Text style={[styles.gradeStatus, on && styles.gradeOnText]}>
                    {g.isActive ? "Active" : "Inactive"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedGrade ? (
            <Card style={{ gap: 10 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.section}>
                  {selectedGrade.label} · {selectedGrade.code}
                </Text>
              </View>
              <View style={styles.tabs}>
                <SoftButton
                  label="View"
                  onPress={() =>
                    setPanel({ kind: "view-grade", id: selectedGrade.id })
                  }
                />
                <SoftButton
                  label="Edit"
                  onPress={() => openEditGrade(selectedGrade)}
                />
                <SoftButton
                  label="Delete"
                  onPress={() => void removeGrade(selectedGrade)}
                />
                <SoftButton
                  label={selectedGrade.isActive ? "Deactivate" : "Activate"}
                  onPress={() => void toggleGrade(selectedGrade)}
                />
              </View>

              {gradeLevels.length > 1 ? (
                <>
                  <Text style={styles.meta}>Level</Text>
                  <View style={styles.tabs}>
                    {gradeLevels.map((l) => (
                      <SoftButton
                        key={l.id}
                        label={l.code}
                        active={activeLevel?.id === l.id}
                        onPress={() => setSelectedLevelId(l.id)}
                      />
                    ))}
                  </View>
                </>
              ) : activeLevel ? (
                <Text style={styles.meta}>
                  Level: {activeLevel.code} · {activeLevel.label}
                </Text>
              ) : (
                <Text style={styles.meta}>No level linked to this grade yet.</Text>
              )}

              {levelGroups.length === 0 ? (
                <Text style={styles.meta}>
                  No group yet — create this grade with scaffold, or add Group A on web
                  Settings.
                </Text>
              ) : null}

              <View style={styles.rowBetween}>
                <Text style={styles.section}>Categories</Text>
                <SoftButton
                  label={
                    panel?.kind === "create-category" ? "Hide" : "+ Create category"
                  }
                  onPress={() => {
                    if (panel?.kind === "create-category") setPanel(null);
                    else {
                      setCategoryForm({
                        label: "",
                        code: "",
                        emoji: "📚",
                        fillStarters: true,
                      });
                      setPanel({ kind: "create-category" });
                    }
                  }}
                />
              </View>

              {panel?.kind === "create-category" ? (
                <View style={styles.createBox}>
                  <Text style={styles.meta}>
                    Adds a topic at the end of {selectedGrade.code}.
                  </Text>
                  <Field
                    label="Label"
                    value={categoryForm.label}
                    onChangeText={(label) =>
                      setCategoryForm((f) => ({
                        ...f,
                        label,
                        code: suggestCategoryCode(label),
                      }))
                    }
                    placeholder="Family and People"
                  />
                  <Field
                    label="Code"
                    autoCapitalize="characters"
                    value={categoryForm.code}
                    onChangeText={(code) =>
                      setCategoryForm((f) => ({ ...f, code }))
                    }
                    placeholder="FAMILY_AND_PEOPLE"
                  />
                  <SoftButton
                    label={
                      categoryForm.fillStarters
                        ? "✓ Auto-fill if theme matches"
                        : "Auto-fill starters: OFF"
                    }
                    active={categoryForm.fillStarters}
                    onPress={() =>
                      setCategoryForm((f) => ({
                        ...f,
                        fillStarters: !f.fillStarters,
                      }))
                    }
                  />
                  <Text style={styles.meta}>
                    Any category name works. Optional auto-fill only for Family,
                    Animals, Fruits, Colors, Body, School, Household, Food, Nature,
                    Action. Otherwise use Upload after create.
                  </Text>
                  <SoftButton
                    label={
                      !levelGroups.length
                        ? "Need a group first"
                        : busy
                          ? "Creating…"
                          : "Create category"
                    }
                    onPress={() => {
                      if (!busy && levelGroups.length) void createCategory();
                    }}
                  />
                </View>
              ) : null}

              {panel?.kind === "edit-category" && panelCategory ? (
                <View style={styles.createBox}>
                  <Text style={styles.section}>Edit {panelCategory.code}</Text>
                  <Text style={styles.meta}>
                    Code is fixed after create — edit label below.
                  </Text>
                  <View style={{ gap: 8 }}>
                    <Text style={styles.fieldLabel}>Code</Text>
                    <Text style={styles.lockedValue}>{categoryForm.code}</Text>
                  </View>
                  <Field
                    label="Label"
                    value={categoryForm.label}
                    autoFocus
                    onChangeText={(label) =>
                      setCategoryForm((f) => ({ ...f, label }))
                    }
                  />
                  <View style={styles.tabs}>
                    <SoftButton
                      label={busy ? "Saving…" : "Save"}
                      onPress={() => {
                        if (!busy) void saveCategory();
                      }}
                    />
                    <SoftButton label="Cancel" onPress={() => setPanel(null)} />
                  </View>
                </View>
              ) : null}

              {panel?.kind === "view-category" && panelCategory ? (
                <View style={styles.createBox}>
                  <Text style={styles.section}>
                    Category · {panelCategory.label}
                  </Text>
                  <Text style={styles.meta}>
                    {panelCategory.code}
                    {panelCategory.group?.level?.code
                      ? ` · ${panelCategory.group.level.code}`
                      : ""}
                  </Text>
                  <Text style={styles.meta}>
                    {panelCategory._count?.words ?? 0} words ·{" "}
                    {panelCategory.isPublished ? "published" : "unpublished"}
                  </Text>
                  <View style={styles.tabs}>
                    <SoftButton
                      label="Upload"
                      onPress={() => viewWordsForCategory(panelCategory)}
                    />
                    <SoftButton
                      label="View"
                      onPress={() => viewWordsForCategory(panelCategory)}
                    />
                    <SoftButton
                      label="Edit"
                      onPress={() => openEditCategory(panelCategory)}
                    />
                    <SoftButton
                      label="Delete"
                      onPress={() => void removeCategory(panelCategory)}
                    />
                    <SoftButton
                      label={panelCategory.isPublished ? "Unpublish" : "Publish"}
                      onPress={() => void toggleCategory(panelCategory)}
                    />
                    <SoftButton label="Close" onPress={() => setPanel(null)} />
                  </View>
                </View>
              ) : null}

              {!levelCategories.length ? (
                <Text style={styles.meta}>No categories for this grade.</Text>
              ) : null}
              {levelCategories.map((c) => (
                <View key={c.id} style={styles.rowItem}>
                  <Text style={styles.rowTitle}>
                    {c.label}
                  </Text>
                  <Text style={styles.meta}>
                    {c._count?.words ?? 0} words ·{" "}
                    {c.isPublished ? "published" : "unpublished"}
                  </Text>
                  <View style={styles.tabs}>
                    <SoftButton
                      label="Upload"
                      onPress={() => viewWordsForCategory(c)}
                    />
                    <SoftButton
                      label="View"
                      onPress={() => viewWordsForCategory(c)}
                    />
                    <SoftButton label="Edit" onPress={() => openEditCategory(c)} />
                    <SoftButton
                      label="Delete"
                      onPress={() => void removeCategory(c)}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <SoftButton label="Refresh" onPress={() => void load()} />
          <SoftButton
            label="Open Vocabulary"
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
  content: { padding: 20, gap: 12, paddingBottom: 100 },
  note: { color: colors.textMuted, lineHeight: 20 },
  info: { color: colors.success, fontWeight: "700" },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  fieldLabel: { fontWeight: "700", color: colors.text },
  lockedValue: {
    backgroundColor: "#F4F4F5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.textMuted,
  },
  meta: { color: colors.textMuted, lineHeight: 18, fontSize: 13 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gradeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gradeCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 2,
  },
  gradeCardOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gradeCode: { fontWeight: "800", color: colors.text, fontSize: 13 },
  gradeLabel: { fontWeight: "700", color: colors.text, fontSize: 15 },
  gradeAges: { color: colors.textMuted, fontSize: 12 },
  gradeStatus: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  gradeOnText: { color: "#fff" },
  rowBetween: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowItem: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTitle: { fontWeight: "700", color: colors.text },
  createBox: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
  },
});
