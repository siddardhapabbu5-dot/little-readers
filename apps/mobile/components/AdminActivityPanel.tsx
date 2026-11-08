import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ActivityCode } from "@little-readers/shared";
import { SoftButton } from "./ui";
import { apiRequest, ApiError } from "../services/api";
import { startActivity, useActivities, type ActivityState } from "../services/activities";
import { PREVIEW_CHILD_ID } from "../services/learning-session";
import { colors } from "../theme";

/**
 * The same five activities parents see. Admin can switch each ON/OFF for every child,
 * and preview it with the selected category (nothing is saved).
 */
export function AdminActivityPanel({ category }: { category?: { id: string; label: string } | null }) {
  const router = useRouter();
  const { activities, setActivities } = useActivities();
  const [saving, setSaving] = useState<ActivityCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(a: ActivityState) {
    setSaving(a.code);
    setError(null);
    try {
      const next = await apiRequest<ActivityState[]>(`/learning/activities/${a.code}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      setActivities(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.section}>
        Child activities{category ? ` · preview with ${category.label}` : ""}
      </Text>
      <Text style={styles.meta}>
        Parents see exactly these activities. Words you upload appear in all of them
        automatically. Switching one OFF hides it for every child.
        {category ? " Preview saves nothing." : " Pick a category to preview."}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {activities.map((a) => (
        <View key={a.code} style={styles.row}>
          <Text style={[styles.name, !a.enabled && styles.off]}>
            {a.emoji} {a.title}
            <Text style={styles.kind}> · {a.kind === "learn" ? "Learn" : "Games"}</Text>
          </Text>
          <SoftButton
            label={saving === a.code ? "…" : a.enabled ? "ON" : "OFF"}
            active={a.enabled}
            onPress={() => void toggle(a)}
          />
          {category ? (
            <SoftButton
              label="Preview"
              onPress={() =>
                startActivity(router, activities.map((x) => ({ ...x, enabled: true })), a.code, {
                  categoryId: category.id,
                  childId: PREVIEW_CHILD_ID,
                  title: `Preview · ${category.label}`,
                })
              }
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#EEF2FF", borderRadius: 14, padding: 12, gap: 8 },
  section: { fontWeight: "800", fontSize: 15, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  error: { color: "#C62828", fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { flex: 1, minWidth: 140, fontWeight: "800", color: colors.text },
  off: { color: colors.textMuted, textDecorationLine: "line-through" },
  kind: { fontWeight: "600", color: colors.textMuted, fontSize: 12 },
});
