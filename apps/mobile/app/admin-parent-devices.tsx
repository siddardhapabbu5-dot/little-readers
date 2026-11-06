import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { CountryCodePicker } from "../components/CountryCodePicker";
import { PrimaryButton } from "../components/ui";
import { goAdminBack } from "../services/admin-nav";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";
import {
  DEFAULT_COUNTRY_ISO,
  findCountry,
  sanitizeNationalInput,
} from "../utils/phone";

type ActiveSession = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
  status: string;
};

type ParentRow = {
  id: string;
  name: string;
  email: string;
  mobileE164: string | null;
  isActive: boolean;
  activeSession: ActiveSession | null;
};

type SessionRow = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  platform: string;
  appVersion: string | null;
  status: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminParentDevicesScreen() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ParentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParentRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [mobileDraft, setMobileDraft] = useState("");
  const [countryIso, setCountryIso] = useState<CountryCode>(DEFAULT_COUNTRY_ISO);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ParentRow[]>("/admin/parents");
      setRows(data);
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

  async function openParent(row: ParentRow) {
    setSelected(row);
    const parsed = row.mobileE164
      ? parsePhoneNumberFromString(row.mobileE164)
      : undefined;
    setCountryIso((parsed?.country as CountryCode | undefined) ?? DEFAULT_COUNTRY_ISO);
    setMobileDraft(parsed?.nationalNumber ?? "");
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<{
        parent: ParentRow;
        sessions: SessionRow[];
      }>(`/admin/parents/${row.id}/device-sessions`);
      setSessions(data.sessions);
      setSelected({
        ...row,
        mobileE164: data.parent.mobileE164,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sessions");
    } finally {
      setBusy(false);
    }
  }

  async function saveMobile() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<{
        id: string;
        mobileE164: string | null;
      }>(`/admin/parents/${selected.id}/mobile`, {
        method: "PATCH",
        body: JSON.stringify({
          mobile: mobileDraft,
          countryCode: findCountry(countryIso).callingCode,
        }),
      });
      setSelected({ ...selected, mobileE164: updated.mobileE164 });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save mobile");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        `/admin/parents/${selected.id}/device-sessions/${sessionId}/revoke`,
        { method: "POST", body: "{}" }
      );
      await openParent(selected);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/parents/${selected.id}/device-sessions/reset`, {
        method: "POST",
        body: "{}",
      });
      await openParent(selected);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => goAdminBack()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={adminColors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Parent devices</Text>
            <Text style={styles.sub}>
              One active parent session per account — revoke anytime
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? (
            <ActivityIndicator color={adminColors.primary} />
          ) : selected ? (
            <View style={{ gap: 12 }}>
              <Pressable onPress={() => setSelected(null)}>
                <Text style={styles.link}>← All parents</Text>
              </Pressable>
              <View style={[styles.card, shadow.soft]}>
                <Text style={styles.name}>{selected.name}</Text>
                <Text style={styles.meta}>{selected.email}</Text>
                <Text style={styles.meta}>
                  Mobile: {selected.mobileE164 ?? "not set"}
                </Text>
                <View style={styles.mobileRow}>
                  <CountryCodePicker
                    value={countryIso}
                    disabled={busy}
                    onChange={setCountryIso}
                  />
                  <TextInput
                    style={styles.input}
                    value={mobileDraft}
                    onChangeText={(v) => setMobileDraft(sanitizeNationalInput(v))}
                    placeholder="Link mobile"
                    keyboardType="phone-pad"
                  />
                  <PrimaryButton
                    label="Save"
                    onPress={() => void saveMobile()}
                    disabled={busy}
                  />
                </View>
                <PrimaryButton
                  label="Revoke all active sessions"
                  color="#EF4444"
                  onPress={() => void resetAll()}
                  disabled={busy}
                />
              </View>

              {busy ? <ActivityIndicator color={adminColors.primary} /> : null}
              {sessions.map((s) => (
                <View key={s.id} style={[styles.card, shadow.soft]}>
                  <Text style={styles.name}>
                    {s.deviceName || s.platform} · {s.status}
                  </Text>
                  <Text style={styles.meta}>Device: {s.deviceId.slice(0, 18)}…</Text>
                  <Text style={styles.meta}>Platform: {s.platform}</Text>
                  <Text style={styles.meta}>Last activity: {fmt(s.lastSeenAt)}</Text>
                  <Text style={styles.meta}>Login: {fmt(s.createdAt)}</Text>
                  {s.revokedReason ? (
                    <Text style={styles.meta}>Reason: {s.revokedReason}</Text>
                  ) : null}
                  {s.status === "ACTIVE" ? (
                    <PrimaryButton
                      label="Revoke"
                      color="#EF4444"
                      onPress={() => void revokeSession(s.id)}
                      disabled={busy}
                    />
                  ) : null}
                </View>
              ))}
              {!sessions.length ? (
                <Text style={styles.meta}>No device sessions yet.</Text>
              ) : null}
            </View>
          ) : (
            rows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => void openParent(row)}
                style={({ pressed }) => [
                  styles.card,
                  shadow.soft,
                  { opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={styles.name}>{row.name}</Text>
                <Text style={styles.meta}>{row.email}</Text>
                <Text style={styles.meta}>
                  Mobile: {row.mobileE164 ?? "—"}
                </Text>
                <Text style={styles.meta}>
                  Active device:{" "}
                  {row.activeSession
                    ? `${row.activeSession.platform} · ${fmt(row.activeSession.lastSeenAt)}`
                    : "none"}
                </Text>
              </Pressable>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  back: { padding: 4 },
  title: { fontSize: 22, fontWeight: "800", color: adminColors.text },
  sub: { fontSize: 12, color: adminColors.textSecondary, marginTop: 2 },
  content: { padding: 16, gap: 10, paddingBottom: 100 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: 14,
    gap: 6,
  },
  name: { fontSize: 16, fontWeight: "800", color: adminColors.text },
  meta: { fontSize: 12, color: adminColors.textSecondary, fontWeight: "600" },
  error: { color: "#B91C1C", fontWeight: "700", marginBottom: 8 },
  link: { color: adminColors.primary, fontWeight: "700", marginBottom: 4 },
  mobileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "600",
  },
});
