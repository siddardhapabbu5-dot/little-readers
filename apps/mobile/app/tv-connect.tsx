import { useCallback, useEffect, useRef, useState } from "react";
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
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Card, ErrorText, Field, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { apiRequest, ApiError } from "../services/api";
import { consumePendingTvCode, getUser, savePendingTvCode } from "../services/secure";
import { colors, radii } from "../theme";

type ChildRow = { id: string; displayName: string; hasLearningSeat?: boolean };

type TvConnection = {
  id: string;
  childId: string;
  childName: string;
  deviceLabel: string;
  connectedAt: string;
  lastSeenAt: string;
};

const TV_ROLES = ["PARENT", "ADMIN", "SUPER_ADMIN"] as const;

/** Accepts a scanned QR (".../tv-connect?code=ABCD-EFGH") or a typed code. */
function extractTvCode(raw: string) {
  const text = String(raw ?? "").trim();
  const fromUrl = /[?&]code=([A-Za-z0-9-]+)/.exec(text)?.[1];
  const code = (fromUrl ?? text).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TvConnectScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      if (typeof params.code === "string" && params.code) {
        await savePendingTvCode(extractTvCode(params.code));
      }
      setReady(true);
    })();
  }, [params.code]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <AuthGate roles={TV_ROLES}>
      <RequireParentGate>
        <TvConnectBody />
      </RequireParentGate>
    </AuthGate>
  );
}

function TvConnectBody() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childId, setChildId] = useState("");
  const [code, setCode] = useState("");
  const [connections, setConnections] = useState<TvConnection[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedOnce = useRef(false);

  const loadConnections = useCallback(async () => {
    setConnections(await apiRequest<TvConnection[]>("/tv/connections"));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const pending = await consumePendingTvCode();
          if (pending) setCode(pending);
          const me = await getUser<{ role: string }>();
          const kids =
            me?.role === "ADMIN" || me?.role === "SUPER_ADMIN"
              ? [await apiRequest<ChildRow>("/children/admin-practice", { method: "POST" })]
              : await apiRequest<ChildRow[]>("/children");
          setChildren(kids);
          setChildId((current) => current || kids[0]?.id || "");
          await loadConnections();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load your TVs");
        }
      })();
    }, [loadConnections])
  );

  async function openScanner() {
    setError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError("Camera permission is needed to scan. You can type the TV code instead.");
        return;
      }
    }
    scannedOnce.current = false;
    setScanning(true);
  }

  function onScanned(result: BarcodeScanningResult) {
    if (scannedOnce.current) return;
    scannedOnce.current = true;
    setScanning(false);
    const next = extractTvCode(result.data);
    if (next.replace("-", "").length !== 8) {
      setError("That QR code is not a Learn Wise TV code.");
      return;
    }
    setCode(next);
    setNotice("TV code scanned. Choose the child and tap Connect TV.");
  }

  async function approve() {
    const clean = extractTvCode(code);
    if (clean.replace("-", "").length !== 8) {
      setError("Enter the 8-character code shown on the TV.");
      return;
    }
    if (!childId) {
      setError("Choose which child will learn on the TV.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ childName: string; deviceLabel: string }>("/tv/pair/approve", {
        method: "POST",
        body: JSON.stringify({ code: clean, childId }),
      });
      setNotice(`✅ ${res.deviceLabel} is now connected for ${res.childName}.`);
      setCode("");
      await loadConnections();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect the TV");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(row: TvConnection) {
    const run = async () => {
      try {
        await apiRequest(`/tv/connections/${row.id}`, { method: "DELETE" });
        setNotice(`${row.deviceLabel} was disconnected.`);
        await loadConnections();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not disconnect the TV");
      }
    };
    if (Platform.OS === "web") {
      void run();
      return;
    }
    Alert.alert("Disconnect this TV?", `${row.childName} will stop learning on ${row.deviceLabel}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void run() },
    ]);
  }

  const child = children.find((c) => c.id === childId);

  if (scanning) {
    return (
      <SafeAreaView style={styles.scanSafe}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onScanned}
        />
        <View style={styles.scanOverlay}>
          <Text style={styles.scanText}>Point the camera at the QR code on the TV</Text>
          <View style={styles.scanFrame} />
          <SoftButton label="Cancel" onPress={() => setScanning(false)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>Connect a TV</Title>
        <Text style={styles.muted}>
          Open siwiapp.shop/tv on your Android TV or Google TV. Scan the QR code it shows, choose
          your child and tap Connect TV. The TV only gets that child's learning activities.
        </Text>
        <ErrorText>{error}</ErrorText>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Card style={{ gap: 12 }}>
          {Platform.OS !== "web" ? (
            <PrimaryButton label="📷 Scan TV QR code" onPress={() => void openScanner()} />
          ) : null}
          <Field
            label="TV code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
          />

          <Text style={styles.section}>Who will learn on the TV?</Text>
          {children.length === 0 ? (
            <Text style={styles.muted}>Add a child on the Parent screen first.</Text>
          ) : (
            <View style={styles.chipRow}>
              {children.map((c) => {
                const on = childId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setChildId(c.id)}
                  >
                    <Text style={[styles.chipText, on && { color: colors.primaryDark }]}>
                      {c.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {child && child.hasLearningSeat === false ? (
            <Text style={styles.warn}>
              {child.displayName} has no learning seat yet, so lessons will not open on the TV.
            </Text>
          ) : null}
          <PrimaryButton
            label={child ? `Connect TV for ${child.displayName}` : "Connect TV"}
            onPress={() => void approve()}
            loading={busy}
            disabled={!childId}
          />
        </Card>

        <Text style={styles.section}>Connected TVs</Text>
        {connections.length === 0 ? (
          <Text style={styles.muted}>No TVs are connected.</Text>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {connections.map((row, i) => (
              <View
                key={row.id}
                style={[styles.row, i === connections.length - 1 && { borderBottomWidth: 0 }]}
              >
                <Text style={styles.rowIcon}>📺</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {row.deviceLabel} · {row.childName}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Connected {formatTime(row.connectedAt)} · Last used {formatTime(row.lastSeenAt)}
                  </Text>
                </View>
                <SoftButton label="Disconnect" onPress={() => void disconnect(row)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 30 },
  muted: { color: colors.textMuted, lineHeight: 20 },
  notice: { color: colors.mintDeep, fontWeight: "700" },
  warn: { color: "#92400E", fontWeight: "700" },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontWeight: "700", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: { fontSize: 22 },
  rowTitle: { fontWeight: "800", color: colors.text },
  rowMeta: { color: colors.tabInactive, fontSize: 12, marginTop: 2 },
  scanSafe: { flex: 1, backgroundColor: "#000" },
  scanOverlay: { flex: 1, alignItems: "center", justifyContent: "space-between", padding: 24 },
  scanText: { color: "#fff", fontWeight: "800", fontSize: 16, textAlign: "center", marginTop: 20 },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 4,
    borderColor: "#fff",
    borderRadius: 20,
  },
});
