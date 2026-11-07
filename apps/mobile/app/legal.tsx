import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TERMS_OF_SERVICE, type LegalSection } from "@little-readers/shared";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { colors } from "../theme";

type PublicPrivacy = {
  published: boolean;
  message: string | null;
  policy: {
    version: string;
    title: string;
    content: string;
    effectiveDate?: string | null;
  } | null;
};

type LegalDoc = {
  title: string;
  meta: string;
  sections: LegalSection[];
};

/** Splits published policy text into numbered sections ("1. Heading" + paragraphs). */
function parsePolicyContent(content: string): LegalSection[] {
  const sections: LegalSection[] = [];
  for (const chunk of content.split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^\d+\.\s/.test(lines[0])) {
      sections.push({ heading: lines[0], paragraphs: lines.length > 1 ? [lines.slice(1).join("\n")] : [] });
    } else if (sections.length) {
      sections[sections.length - 1].paragraphs.push(lines.join("\n"));
    } else {
      sections.push({ heading: "", paragraphs: [lines.join("\n")] });
    }
  }
  return sections;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ doc?: string }>();
  const isPrivacy = params.doc === "privacy";

  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrivacy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<PublicPrivacy>("/privacy/policy");
      if (!data.published || !data.policy) {
        setDoc(null);
        setError(data.message ?? "The Privacy Policy has not been published yet.");
        return;
      }
      const effective = formatDate(data.policy.effectiveDate);
      setDoc({
        title: data.policy.title?.trim() || "Privacy Policy",
        meta: `Version ${data.policy.version}${effective ? ` · Effective ${effective}` : ""}`,
        sections: parsePolicyContent(data.policy.content),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the Privacy Policy. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPrivacy) {
      void loadPrivacy();
    } else {
      setDoc({
        title: TERMS_OF_SERVICE.title,
        meta: `Version ${TERMS_OF_SERVICE.version} · Effective ${TERMS_OF_SERVICE.effectiveDate}`,
        sections: TERMS_OF_SERVICE.sections,
      });
    }
  }, [isPrivacy, loadPrivacy]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>{doc?.title ?? (isPrivacy ? "Privacy Policy" : "Terms of Service")}</Title>
        {doc ? <Text style={styles.meta}>{doc.meta}</Text> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {error ? (
          <Card style={{ gap: 10 }}>
            <ErrorText>{error}</ErrorText>
            {isPrivacy ? <SoftButton label="Try again" onPress={() => void loadPrivacy()} /> : null}
          </Card>
        ) : null}

        {doc ? (
          <Card style={{ gap: 14 }}>
            {doc.sections.map((s, i) => (
              <View key={`${i}-${s.heading}`} style={{ gap: 6 }}>
                {s.heading ? <Text style={styles.heading}>{s.heading}</Text> : null}
                {s.paragraphs.map((p, j) => (
                  <Text key={j} style={styles.body}>
                    {p}
                  </Text>
                ))}
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  meta: { color: colors.textMuted, fontWeight: "700" },
  center: { paddingVertical: 24, alignItems: "center" },
  heading: { color: colors.primaryDark, fontWeight: "800", fontSize: 15 },
  body: { color: colors.text, lineHeight: 21, fontSize: 14 },
});
