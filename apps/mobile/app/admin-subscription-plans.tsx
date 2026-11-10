import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { Card, ErrorText, Field, KeyboardScroll, SoftButton, Title } from "../components/ui";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";

type Level = { id: string; code: string; label: string };
type Plan = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  durationMonths: number;
  amountPaise: number;
  amountPhpCentavos?: number | null;
  currency: string;
  applicableLevel: string;
  levelId?: string | null;
  level?: Level | null;
  isActive: boolean;
  isPublished: boolean;
  sortOrder: number;
};

const DURATIONS = [
  { months: 1, label: "Monthly" },
  { months: 3, label: "3 Months" },
  { months: 6, label: "6 Months" },
  { months: 12, label: "1 Year" },
];

function inr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

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

export default function AdminSubscriptionPlansScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Plan[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    code: string;
    description: string;
    durationMonths: number;
    amountInr: string;
    amountPhp: string;
    applicableLevel: string;
    levelId: string;
    isPublished: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plans, lvls] = await Promise.all([
        apiRequest<Plan[]>("/admin/academic/subscription-plans"),
        apiRequest<Level[]>("/admin/academic/levels"),
      ]);
      setRows(plans);
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
    const sorted = [...rows].sort(
      (a, b) =>
        a.durationMonths - b.durationMonths ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
    );
    if (!q.trim()) return sorted;
    const s = q.toLowerCase();
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s)
    );
  }, [rows, q]);

  async function save() {
    if (!form) return;
    const amountPaise = Math.round(Number(form.amountInr) * 100);
    if (!amountPaise || amountPaise <= 0) {
      setError("Amount (INR) must be greater than zero");
      return;
    }
    const amountPhpCentavos = form.amountPhp.trim()
      ? Math.round(Number(form.amountPhp) * 100)
      : null;
    if (amountPhpCentavos !== null && !(amountPhpCentavos > 0)) {
      setError("Philippines price must be greater than zero, or left empty");
      return;
    }
    try {
      const body = {
        name: form.name,
        code: form.code,
        description: form.description || null,
        durationMonths: form.durationMonths,
        amountPaise,
        amountPhpCentavos,
        applicableLevel: form.applicableLevel,
        levelId: form.levelId || null,
        isPublished: form.isPublished,
        isActive: true,
      };
      if (form.id) {
        await apiRequest(`/admin/academic/subscription-plans/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest("/admin/academic/subscription-plans", {
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
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Subscription Plans</Title>
          <Text style={styles.sub}>
            Subscription Management · prices in INR (stored as paise)
          </Text>
          <Text style={styles.hint}>
            Only Published plans appear on the Parent subscription screen. Draft
            plans stay admin-only.
          </Text>
          <ErrorText>{error}</ErrorText>

          <Field label="Search" value={q} onChangeText={setQ} />
          <SoftButton
            label="+ Add Plan"
            onPress={() =>
              setForm({
                name: "Monthly",
                code: "PLAN_1M",
                description: "",
                durationMonths: 1,
                amountInr: "",
                amountPhp: "",
                applicableLevel: "ALL",
                levelId: "",
                isPublished: true,
              })
            }
          />

          {form ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.cardTitle}>
                {form.id ? "Edit Plan" : "Add Plan"}
              </Text>
              {!form.id ? (
                <Field
                  label="Plan Code"
                  value={form.code}
                  onChangeText={(v) =>
                    setForm({ ...form, code: v.toUpperCase() })
                  }
                />
              ) : null}
              <Field
                label="Plan Name"
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
              />
              <Text style={styles.meta}>Duration</Text>
              <View style={styles.filters}>
                {DURATIONS.map((d) => (
                  <Pressable
                    key={d.months}
                    onPress={() =>
                      setForm({
                        ...form,
                        durationMonths: d.months,
                        // Suggest a clean parent-facing name when empty / test-like
                        name:
                          !form.name.trim() ||
                          /\d{10,}/.test(form.name) ||
                          /renamed/i.test(form.name)
                            ? d.label
                            : form.name,
                        code: form.id
                          ? form.code
                          : form.code && !/\d{10,}/.test(form.code)
                            ? form.code
                            : `PLAN_${d.months}M`,
                      })
                    }
                    style={[
                      styles.chip,
                      form.durationMonths === d.months && styles.chipOn,
                    ]}
                  >
                    <Text style={styles.chipText}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Amount (INR)"
                value={form.amountInr}
                onChangeText={(v) => setForm({ ...form, amountInr: v })}
                keyboardType="decimal-pad"
              />
              <Field
                label="Philippines price (₱, final amount)"
                value={form.amountPhp}
                onChangeText={(v) => setForm({ ...form, amountPhp: v })}
                keyboardType="decimal-pad"
                placeholder="Leave empty to charge INR"
              />
              <Text style={styles.meta}>Applicable Level</Text>
              <View style={styles.filters}>
                <Pressable
                  onPress={() =>
                    setForm({
                      ...form,
                      applicableLevel: "ALL",
                      levelId: "",
                    })
                  }
                  style={[
                    styles.chip,
                    form.applicableLevel === "ALL" && styles.chipOn,
                  ]}
                >
                  <Text style={styles.chipText}>All Levels</Text>
                </Pressable>
                {levels.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() =>
                      setForm({
                        ...form,
                        applicableLevel: l.code,
                        levelId: l.id,
                      })
                    }
                    style={[
                      styles.chip,
                      form.levelId === l.id && styles.chipOn,
                    ]}
                  >
                    <Text style={styles.chipText}>{l.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Description"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
              />
              <Pressable
                onPress={() =>
                  setForm({ ...form, isPublished: !form.isPublished })
                }
                style={[
                  styles.chip,
                  form.isPublished && styles.chipOn,
                  { alignSelf: "flex-start" },
                ]}
              >
                <Text style={styles.chipText}>
                  {form.isPublished
                    ? "Published · visible to parents"
                    : "Draft · hidden from parents"}
                </Text>
              </Pressable>
              <SoftButton
                label={form.isPublished ? "Save & publish" : "Save as draft"}
                onPress={() => void save()}
              />
              <SoftButton label="Cancel" onPress={() => setForm(null)} />
            </Card>
          ) : null}

          {loading ? (
            <ActivityIndicator color={adminColors.primary} />
          ) : !filtered.length ? (
            <Text style={styles.meta}>No plans yet. Add a published plan for parents.</Text>
          ) : (
            filtered.map((r) => (
              <View key={r.id} style={[styles.row, shadow.soft]}>
                <Text style={styles.cardTitle}>
                  {r.name} · {r.code}
                </Text>
                <Text style={styles.meta}>
                  {r.durationMonths} mo · {inr(r.amountPaise)} ·{" "}
                  {r.amountPhpCentavos ? `₱${(r.amountPhpCentavos / 100).toFixed(2)} · ` : ""}
                  {r.level?.label ?? r.applicableLevel} ·{" "}
                  {r.isActive ? "Active" : "Inactive"} ·{" "}
                  {r.isPublished ? "Published" : "Draft (hidden from parents)"}
                </Text>
                {r.description ? (
                  <Text style={styles.meta}>{r.description}</Text>
                ) : null}
                <View style={styles.actions}>
                  <SoftButton
                    label="Edit"
                    onPress={() =>
                      setForm({
                        id: r.id,
                        name: r.name,
                        code: r.code,
                        description: r.description ?? "",
                        durationMonths: r.durationMonths,
                        amountInr: String(r.amountPaise / 100),
                        amountPhp: r.amountPhpCentavos ? String(r.amountPhpCentavos / 100) : "",
                        applicableLevel: r.applicableLevel,
                        levelId: r.levelId ?? "",
                        isPublished: r.isPublished,
                      })
                    }
                  />
                  <SoftButton
                    label={r.isPublished ? "Unpublish" : "Publish for parents"}
                    onPress={() =>
                      void apiRequest(
                        `/admin/academic/subscription-plans/${r.id}/publish?published=${
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
                            `/admin/academic/subscription-plans/${r.id}/deactivate`,
                            { method: "POST", body: "{}" }
                          )
                        : apiRequest(
                            `/admin/academic/subscription-plans/${r.id}`,
                            {
                              method: "PATCH",
                              body: JSON.stringify({ isActive: true }),
                            }
                          )
                      ).then(load)
                    }
                  />
                  <SoftButton
                    label="Delete"
                    onPress={() =>
                      confirm(
                        "Delete plan?",
                        "Plans with payment history are archived instead.",
                        () =>
                          void apiRequest(
                            `/admin/academic/subscription-plans/${r.id}`,
                            { method: "DELETE" }
                          ).then(load)
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
  hint: {
    color: adminColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
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
