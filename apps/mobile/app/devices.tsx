import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  Title,
} from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getOrCreateInstallationId } from "../services/secure";
import { colors } from "../theme";

type ChildRow = { id: string; displayName: string };

export default function DevicesScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childId, setChildId] = useState("");
  const [status, setStatus] = useState("—");
  const [history, setHistory] = useState<any[]>([]);
  const [reason, setReason] = useState("Lost or replaced phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (id: string) => {
    const device = await apiRequest<{ registered: boolean; device: any }>(
      `/devices/children/${id}`
    );
    setStatus(
      device.registered
        ? `Registered on ${device.device?.platform} (…${device.device?.installationIdSuffix})`
        : "No active registered phone"
    );
    setHistory(await apiRequest(`/devices/children/${id}/transfers`));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const kids = await apiRequest<ChildRow[]>("/children");
          setChildren(kids);
          const id = kids[0]?.id ?? "";
          setChildId(id);
          if (id) await refresh(id);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed");
        }
      })();
    }, [refresh])
  );

  async function transfer() {
    setBusy(true);
    setError(null);
    try {
      // Bind THIS phone/browser in the same step so play works without asking again.
      const installationId = await getOrCreateInstallationId();
      const result = await apiRequest<{ message: string }>("/devices/transfer", {
        method: "POST",
        body: JSON.stringify({
          childId,
          reason,
          newInstallationId: installationId,
          platform: Platform.OS,
          deviceLabel: `${Platform.OS} phone`,
          appVersion: Constants.expoConfig?.version ?? "0.1.0",
        }),
      });
      setStatus(result.message);
      await refresh(childId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>Device management</Title>
        <Text style={styles.note}>
          Each student can use only ONE registered phone. Logout does not release the
          device. Parents/admins authorize transfers.
        </Text>
        <ErrorText>{error}</ErrorText>

        <Text style={styles.section}>Student</Text>
        <View style={{ gap: 8 }}>
          {children.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, childId === c.id && styles.chipOn]}
              onPress={() => {
                setChildId(c.id);
                void refresh(c.id);
              }}
            >
              <Text style={{ fontWeight: "700" }}>{c.displayName}</Text>
            </Pressable>
          ))}
        </View>

        <Card>
          <Text style={styles.section}>Registration status</Text>
          <Text style={{ marginTop: 6, fontWeight: "700", color: colors.text }}>{status}</Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={styles.section}>Authorized transfer</Text>
          <Field label="Reason" value={reason} onChangeText={setReason} />
          <PrimaryButton
            label="Revoke phone (allow new phone)"
            onPress={() => void transfer()}
            loading={busy}
          />
        </Card>

        <Text style={styles.section}>Transfer history</Text>
        {history.map((h) => (
          <Card key={h.id}>
            <Text style={{ fontWeight: "800" }}>
              {h.action} · {new Date(h.createdAt).toLocaleString()}
            </Text>
            <Text style={{ color: colors.textMuted }}>{h.reason}</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 30 },
  note: { color: colors.textMuted, lineHeight: 20 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  chip: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
});
