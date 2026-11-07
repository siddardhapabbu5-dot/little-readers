import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Card, ErrorText, Field, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getOrCreateInstallationId, phoneLabel } from "../services/secure";
import { colors, radii } from "../theme";

type ChildRow = { id: string; displayName: string; hasLearningSeat?: boolean };

type DeviceInfo = {
  platform: string;
  deviceLabel: string | null;
  registeredAt: string;
  lastSeenAt: string;
  installationIdSuffix: string;
};

type TransferRow = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, { icon: string; label: string }> = {
  REGISTER: { icon: "📱", label: "Phone registered" },
  TRANSFER: { icon: "🔁", label: "Moved to a new phone" },
  REVOKE: { icon: "🔓", label: "Phone released" },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DevicesScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childId, setChildId] = useState("");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [registeredMap, setRegisteredMap] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<TransferRow[]>([]);
  const [thisPhoneSuffix, setThisPhoneSuffix] = useState("");
  const [reason, setReason] = useState("Lost or replaced phone");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (id: string) => {
    const status = await apiRequest<{ registered: boolean; device: DeviceInfo | null }>(
      `/devices/children/${id}`
    );
    setDevice(status.registered ? status.device : null);
    setRegisteredMap((m) => ({ ...m, [id]: status.registered }));
    setHistory(await apiRequest<TransferRow[]>(`/devices/children/${id}/transfers`));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const installationId = await getOrCreateInstallationId();
          setThisPhoneSuffix(installationId.slice(-8));
          const kids = await apiRequest<ChildRow[]>("/children");
          setChildren(kids);
          const id = kids.find((k) => k.id === childId)?.id ?? kids[0]?.id ?? "";
          setChildId(id);
          await Promise.all(
            kids.map(async (k) => {
              const s = await apiRequest<{ registered: boolean }>(`/devices/children/${k.id}`);
              setRegisteredMap((m) => ({ ...m, [k.id]: s.registered }));
            })
          );
          if (id) await refresh(id);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load devices");
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh])
  );

  const child = children.find((c) => c.id === childId);
  const isThisPhone = Boolean(device && device.installationIdSuffix === thisPhoneSuffix);

  async function moveToThisPhone() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const installationId = await getOrCreateInstallationId();
      await apiRequest("/devices/transfer", {
        method: "POST",
        body: JSON.stringify({
          childId,
          reason: reason.trim() || "Authorized device transfer",
          newInstallationId: installationId,
          platform: Platform.OS,
          deviceLabel: phoneLabel(),
          appVersion: Constants.expoConfig?.version ?? "0.1.0",
        }),
      });
      setNotice(`${child?.displayName ?? "Student"} is now locked to this phone.`);
      await refresh(childId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change phone");
    } finally {
      setBusy(false);
    }
  }

  function confirmMove() {
    const name = child?.displayName ?? "this student";
    const message = device
      ? `The old phone will stop working for ${name}, and this phone will be used instead.`
      : `This phone will be locked as ${name}'s learning phone.`;
    if (Platform.OS === "web") {
      void moveToThisPhone();
      return;
    }
    Alert.alert("Change learning phone?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Yes, continue", onPress: () => void moveToThisPhone() },
    ]);
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content}>
            <SoftButton label="← Back" onPress={() => router.back()} />
            <Title>Device management</Title>
            <Text style={styles.note}>
              Each student learns on ONE phone. Logging out does not release it — only a
              parent or admin can move a student to a new phone.
            </Text>
            <ErrorText>{error}</ErrorText>
            {notice ? <Text style={styles.notice}>✅ {notice}</Text> : null}

            <Text style={styles.section}>Student</Text>
            {children.length === 0 ? (
              <Text style={styles.muted}>Add a child on the Parent screen first.</Text>
            ) : (
              <View style={styles.chipRow}>
                {children.map((c) => {
                  const on = childId === c.id;
                  const locked = registeredMap[c.id];
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => {
                        setChildId(c.id);
                        setNotice(null);
                        void refresh(c.id);
                      }}
                    >
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: locked ? colors.success : colors.tabInactive },
                        ]}
                      />
                      <Text style={[styles.chipText, on && { color: colors.primaryDark }]}>
                        {c.displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {child ? (
              <>
                <Card style={{ gap: 12 }}>
                  <View style={styles.cardHead}>
                    <Text style={styles.section}>Learning phone</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: device ? colors.mintSoft : colors.yellowSoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: device ? colors.mintDeep : "#92400E" },
                        ]}
                      >
                        {device ? "🔒 Locked" : "Not registered"}
                      </Text>
                    </View>
                  </View>

                  {device ? (
                    <View style={styles.table}>
                      <InfoRow
                        label="Phone"
                        value={`${device.deviceLabel || device.platform}${isThisPhone ? "  (this phone)" : ""}`}
                      />
                      <InfoRow label="System" value={device.platform} />
                      <InfoRow label="Device ID" value={`…${device.installationIdSuffix}`} />
                      <InfoRow label="Registered" value={formatDate(device.registeredAt)} />
                      <InfoRow label="Last used" value={formatDate(device.lastSeenAt)} last />
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <Text style={styles.muted}>
                        {child.displayName}'s phone locks automatically the first time they
                        learn:
                      </Text>
                      <Step
                        n={1}
                        done={Boolean(child.hasLearningSeat)}
                        text={
                          child.hasLearningSeat
                            ? "Learning seat is active"
                            : "Activate a learning seat (subscription) for this child"
                        }
                      />
                      <Step n={2} text="Install the app on the child's phone and log in" />
                      <Step n={3} text="Open the Learn tab — the phone is locked automatically" />
                    </View>
                  )}
                </Card>

                <Card style={{ gap: 10 }}>
                  <Text style={styles.section}>
                    {device ? "Change phone" : "Use this phone instead"}
                  </Text>
                  <Text style={styles.muted}>
                    {device
                      ? isThisPhone
                        ? "This phone is already the learning phone. To move to another phone, open this screen on the new phone."
                        : "Lost or replaced phone? Do this on the NEW phone: the old phone is released and this phone becomes the learning phone."
                      : `Lock ${child.displayName} to the phone you are holding right now.`}
                  </Text>
                  {!isThisPhone ? (
                    <>
                      <Field label="Reason" value={reason} onChangeText={setReason} />
                      <PrimaryButton
                        label={device ? "Move to this phone" : "Register this phone"}
                        onPress={confirmMove}
                        loading={busy}
                      />
                    </>
                  ) : null}
                </Card>

                <Text style={styles.section}>Phone history</Text>
                {history.length === 0 ? (
                  <Text style={styles.muted}>No phone changes yet.</Text>
                ) : (
                  <Card style={{ paddingVertical: 4 }}>
                    {history.map((h, i) => {
                      const meta = ACTION_LABELS[h.action] ?? { icon: "•", label: h.action };
                      return (
                        <View
                          key={h.id}
                          style={[styles.historyRow, i === history.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <Text style={styles.historyIcon}>{meta.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyTitle}>{meta.label}</Text>
                            {h.reason ? <Text style={styles.muted}>{h.reason}</Text> : null}
                            <Text style={styles.historyDate}>{formatDate(h.createdAt)}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                )}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Step({ n, text, done }: { n: number; text: string; done?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, done && { backgroundColor: colors.success }]}>
        <Text style={styles.stepNumText}>{done ? "✓" : n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 30 },
  note: { color: colors.textMuted, lineHeight: 20 },
  notice: { color: colors.mintDeep, fontWeight: "700" },
  muted: { color: colors.textMuted, lineHeight: 20 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontWeight: "700", color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { fontWeight: "800", fontSize: 12 },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontWeight: "600" },
  infoValue: { color: colors.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  step: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  stepText: { flex: 1, color: colors.text, fontWeight: "600" },
  historyRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyIcon: { fontSize: 20 },
  historyTitle: { fontWeight: "800", color: colors.text },
  historyDate: { color: colors.tabInactive, fontSize: 12, marginTop: 2 },
});
