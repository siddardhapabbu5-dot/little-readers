import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Card, SoftButton } from "./ui";
import { apiRequest, ApiError } from "../services/api";
import { colors } from "../theme";

type GradeSub = {
  id: string;
  plan: string;
  status: string;
  expiresAt: string;
  eligible: boolean;
  gradeLabel: string | null;
};
type ChildAccess = {
  childId: string;
  displayName: string;
  level: { id: string; code: string };
  gradeLabel: string;
  entitled: boolean;
  via: string | null;
  expiresAt: string | null;
  gradeSubscriptions: GradeSub[];
};

/** Test-only grade entitlement: ₹0 admin grant for one child in their own grade; no gateway is called. */
export function AdminGradeAccessCard() {
  const [email, setEmail] = useState("");
  const [parentName, setParentName] = useState<string | null>(null);
  const [children, setChildren] = useState<ChildAccess[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<{ parent: { name: string; email: string }; children: ChildAccess[] }>(
        `/subscriptions/admin/grade-access?email=${encodeURIComponent(email.trim())}`
      );
      setParentName(`${data.parent.name} · ${data.parent.email}`);
      setChildren(data.children);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed");
      setChildren([]);
      setParentName(null);
    } finally {
      setBusy(false);
    }
  }

  async function grant(child: ChildAccess, months: number) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/subscriptions/admin/grade-grant", {
        method: "POST",
        body: JSON.stringify({ childId: child.childId, levelId: child.level.id, months }),
      });
      setInfo(`${child.displayName}: ${child.gradeLabel.split(" – ")[0]} access granted for ${months} month(s).`);
      await lookup();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function expire(child: ChildAccess, sub: GradeSub) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/subscriptions/admin/grade-subscriptions/${sub.id}/expire`, {
        method: "POST",
        body: "{}",
      });
      setInfo(`${child.displayName}: ${sub.plan} expired.`);
      await lookup();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Expire failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      <Text style={styles.title}>Grade access (test entitlements)</Text>
      <Text style={styles.note}>
        Grants a ₹0 subscription for one child in that child's own grade. No payment gateway is
        used; for local testing and support only.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Parent email"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={() => void lookup()}
      />
      <SoftButton label={busy ? "Loading…" : "Find children"} onPress={() => void lookup()} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}
      {parentName ? <Text style={styles.row}>{parentName}</Text> : null}
      {children.map((c) => (
        <View key={c.childId} style={styles.child}>
          <Text style={styles.name}>
            {c.displayName} · {c.gradeLabel}
          </Text>
          <Text style={c.entitled ? styles.row : styles.error}>
            {c.entitled
              ? `Access via ${c.via === "GRADE" ? "grade subscription" : c.via === "LEGACY_FAMILY" ? "family plan" : "staff"}${
                  c.expiresAt ? ` until ${new Date(c.expiresAt).toLocaleDateString()}` : ""
                }`
              : "No access to this grade"}
          </Text>
          {c.gradeSubscriptions.map((s) => (
            <View key={s.id} style={styles.subRow}>
              <Text style={styles.row}>
                {s.plan} · {s.status} · {new Date(s.expiresAt).toLocaleDateString()}
                {s.eligible ? "" : " (not active)"}
              </Text>
              {s.eligible ? (
                <SoftButton label="Expire now" onPress={() => void expire(c, s)} />
              ) : null}
            </View>
          ))}
          <View style={styles.actions}>
            <SoftButton label="Grant 1 month" onPress={() => void grant(c, 1)} />
            <SoftButton label="Grant 12 months" onPress={() => void grant(c, 12)} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "800", fontSize: 16, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13 },
  row: { color: colors.textMuted, fontSize: 13 },
  name: { fontWeight: "800", color: colors.text },
  info: { color: colors.primary, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  child: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: "#fff",
  },
});
