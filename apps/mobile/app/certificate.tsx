import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, SoftButton } from "../components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { IconButton, KidsButton, KidsHeader, SkyBackground } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import {
  downloadCertificatePdf,
  formatCertificateDate,
  shareCertificate,
  type CertificateData,
} from "../services/certificate-pdf";
import { colors, radii, shadow } from "../theme";

const RAINBOW = ["#FF5252", "#FF9800", "#FFD600", "#4CAF50", "#2196F3", "#7C4DFF", "#E040FB"] as const;
const NAME_COLORS = ["#E53935", "#FB8C00", "#F4B400", "#43A047", "#1E88E5", "#8E24AA", "#D81B60"];

export default function CertificateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Certificate not found");
      return;
    }
    apiRequest<CertificateData>(`/learning/certificates/${encodeURIComponent(String(id))}`)
      .then(setCert)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load certificate"));
  }, [id]);

  async function run(action: (c: CertificateData) => Promise<void>) {
    if (!cert || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action(cert);
    } catch {
      setError("Could not open the PDF on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title="My certificate"
        />
        <ScrollView contentContainerStyle={styles.content}>
          <ErrorText>{error}</ErrorText>
          {!cert && !error ? <ActivityIndicator color={colors.primary} /> : null}
          {cert ? (
            <>
              <LinearGradient
                colors={RAINBOW}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.frame, shadow.card]}
              >
                <LinearGradient
                  colors={["#FFF8E1", "#FCE4EC", "#E3F2FD", "#E8F5E9"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.inner}
                >
                  <Text style={[styles.corner, { top: 6, left: 10 }]}>🎈</Text>
                  <Text style={[styles.corner, { top: 6, right: 10 }]}>🌈</Text>
                  <Text style={[styles.corner, { bottom: 6, left: 10 }]}>🎉</Text>
                  <Text style={[styles.corner, { bottom: 6, right: 10 }]}>🚀</Text>
                  <LinearGradient
                    colors={RAINBOW}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ring}
                  >
                    {cert.photoUrl ? (
                      <Image source={{ uri: cert.photoUrl }} style={styles.photo} />
                    ) : (
                      <View style={[styles.photo, styles.initialBox]}>
                        <Text style={styles.initial}>
                          {Array.from(cert.childName.trim())[0]?.toUpperCase() ?? "⭐"}
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                  <Text style={styles.medal}>🏅</Text>
                  <Text style={styles.brand}>{cert.appName}</Text>
                  <LinearGradient
                    colors={["#FF7043", "#EC407A", "#AB47BC"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ribbon}
                  >
                    <Text style={styles.ribbonText}>🏆 CERTIFICATE OF ACHIEVEMENT 🏆</Text>
                  </LinearGradient>
                  <Text style={styles.lead}>This certificate is proudly presented to</Text>
                  <Text style={styles.name}>
                    {Array.from(cert.childName).map((ch, i) => (
                      <Text key={i} style={{ color: NAME_COLORS[i % NAME_COLORS.length] }}>
                        {ch}
                      </Text>
                    ))}
                  </Text>
                  <LinearGradient
                    colors={["#FFD600", "#FF9800", "#FF5252"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.line}
                  />
                  <Text style={styles.lead}>
                    for learning all {cert.category?.wordCount} words in
                  </Text>
                  <View style={styles.catPill}>
                    <Text style={styles.cat}>
                      {displayEmoji(cert.category?.emoji ?? "🎓")} {cert.category?.label ?? cert.title}
                    </Text>
                  </View>
                  <Text style={styles.stars}>⭐⭐⭐</Text>
                  <Text style={styles.cheer}>Super job! Keep shining! ✨</Text>
                  <View style={styles.foot}>
                    <View style={styles.chip}>
                      <Text style={styles.footValue}>{formatCertificateDate(cert.issuedAt)}</Text>
                      <Text style={styles.footLabel}>Date of completion</Text>
                    </View>
                    <View style={[styles.chip, { alignItems: "flex-end" }]}>
                      <Text style={styles.footValue}>{cert.certificateNo}</Text>
                      <Text style={styles.footLabel}>Certificate No.</Text>
                    </View>
                  </View>
                </LinearGradient>
              </LinearGradient>
              <KidsButton
                label={busy ? "Please wait…" : "⬇️ Download PDF"}
                loading={busy}
                onPress={() => void run(downloadCertificatePdf)}
              />
              <KidsButton
                tone="orange"
                label="📤 Share (WhatsApp and more)"
                disabled={busy}
                onPress={() => void run(shareCertificate)}
              />
              <SoftButton label="🏆 My rewards" onPress={() => router.push("/(tabs)/rewards")} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      </SkyBackground>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent", paddingHorizontal: 16 },
  content: { paddingVertical: 12, gap: 12, paddingBottom: 40, width: "100%", maxWidth: 640, alignSelf: "center" },
  frame: { borderRadius: radii.xl, padding: 6 },
  inner: {
    borderRadius: radii.lg,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
  },
  corner: { position: "absolute", fontSize: 26 },
  ring: { width: 132, height: 132, borderRadius: 66, padding: 5 },
  photo: { width: "100%", height: "100%", borderRadius: 61, borderWidth: 4, borderColor: "#fff" },
  initialBox: { backgroundColor: "#7C4DFF", alignItems: "center", justifyContent: "center" },
  initial: { color: "#fff", fontSize: 56, fontWeight: "900" },
  medal: { fontSize: 34, marginTop: -18 },
  brand: { fontSize: 22, fontWeight: "900", letterSpacing: 4, color: "#7C4DFF" },
  ribbon: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, marginTop: 4 },
  ribbonText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  lead: { fontSize: 13, color: "#5D4037", fontWeight: "700", textAlign: "center", marginTop: 8 },
  name: { fontSize: 34, fontWeight: "900", textAlign: "center" },
  line: { width: "70%", height: 5, borderRadius: 3 },
  catPill: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#E8F5E9",
    borderWidth: 2,
    borderColor: "#66BB6A",
  },
  cat: { fontSize: 22, fontWeight: "900", color: "#2E7D32", textAlign: "center" },
  stars: { fontSize: 24, letterSpacing: 4, marginTop: 6 },
  cheer: { fontSize: 14, fontWeight: "900", color: "#F57C00" },
  foot: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: 14, gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E1D5FF",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  footValue: { fontWeight: "800", color: "#311B92", fontSize: 13 },
  footLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
});
