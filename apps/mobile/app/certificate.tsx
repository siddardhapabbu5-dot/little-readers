import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, SoftButton } from "../components/ui";
import { IconButton, KidsButton, KidsHeader, SkyBackground } from "../components/kids";
import { art } from "../components/illustrations";
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

export default function CertificateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
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
              <View style={[styles.frame, shadow.card]}>
                <View style={styles.inner}>
                  <Image source={art.certificate} style={styles.badgeArt} resizeMode="contain" />
                  <Text style={styles.brand}>{cert.appName}</Text>
                  <Text style={styles.kind}>CERTIFICATE OF ACHIEVEMENT</Text>
                  <Text style={styles.lead}>This certificate is proudly presented to</Text>
                  <Text style={styles.name}>{cert.childName}</Text>
                  <View style={styles.line} />
                  <Text style={styles.lead}>
                    for learning all {cert.category?.wordCount} words in
                  </Text>
                  <Text style={styles.cat}>
                    {displayEmoji(cert.category?.emoji ?? "🎓")} {cert.category?.label ?? cert.title}
                  </Text>
                  <Text style={styles.stars}>⭐ ⭐ ⭐</Text>
                  <View style={styles.foot}>
                    <View>
                      <Text style={styles.footValue}>{formatCertificateDate(cert.issuedAt)}</Text>
                      <Text style={styles.footLabel}>Date of completion</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.footValue}>{cert.certificateNo}</Text>
                      <Text style={styles.footLabel}>Certificate No.</Text>
                    </View>
                  </View>
                </View>
              </View>
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
  badgeArt: { width: 84, height: 84, marginBottom: 2 },
  frame: {
    borderWidth: 5,
    borderColor: "#6C4CF1",
    borderRadius: radii.xl,
    padding: 6,
    backgroundColor: "#FFF8E1",
  },
  inner: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#F5B700",
    borderRadius: radii.lg,
    padding: 18,
    alignItems: "center",
    gap: 4,
  },
  brand: { fontSize: 24, fontWeight: "900", letterSpacing: 4, color: "#6C4CF1" },
  kind: { fontSize: 13, fontWeight: "800", color: "#F08A00", letterSpacing: 1.5 },
  lead: { fontSize: 13, color: colors.textMuted, fontWeight: "600", textAlign: "center", marginTop: 8 },
  name: { fontSize: 30, fontWeight: "900", color: colors.text, textAlign: "center" },
  line: { width: "60%", borderBottomWidth: 3, borderBottomColor: "#F5B700" },
  cat: { fontSize: 22, fontWeight: "900", color: "#2E7D32", textAlign: "center" },
  stars: { fontSize: 20, letterSpacing: 4, marginTop: 4 },
  foot: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: 14 },
  footValue: { fontWeight: "800", color: colors.text, fontSize: 13 },
  footLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
});
