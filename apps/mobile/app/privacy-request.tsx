import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "../components/AuthGate";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors, radii } from "../theme";

type PublicPrivacy = {
  published: boolean;
  policy: {
    supportEmail?: string | null;
    deletionRequestContact?: string | null;
    version?: string;
  } | null;
};

export default function PrivacyRequestScreen() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<PublicPrivacy>("/privacy/policy")
      .then((p) => {
        setContact(
          p.policy?.deletionRequestContact ||
            p.policy?.supportEmail ||
            null
        );
        setVersion(p.policy?.version ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function submit() {
    setError(null);
    setInfo(null);
    if (message.trim().length < 10) {
      setError("Please describe your request (at least 10 characters).");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ message?: string }>("/privacy/requests/me", {
        method: "POST",
        body: JSON.stringify({
          requestType: "ACCOUNT_DELETION",
          message: message.trim(),
        }),
      });
      setInfo(
        data.message ??
          "Request submitted for administrator review. Nothing was deleted automatically."
      );
      setMessage("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Privacy & data requests</Title>
          <Text style={styles.note}>
            Submit a request for account or data deletion review. Learning history
            and payments are not deleted automatically.
          </Text>
          {version ? (
            <Text style={styles.meta}>Published policy version: {version}</Text>
          ) : null}
          {contact ? (
            <Text style={styles.meta}>Privacy contact: {contact}</Text>
          ) : (
            <Text style={styles.meta}>
              Contact details appear after an administrator publishes the Privacy
              Policy.
            </Text>
          )}
          <Card style={{ gap: 8 }}>
            <Text style={styles.label}>Your request</Text>
            <TextInput
              style={styles.area}
              multiline
              value={message}
              onChangeText={setMessage}
              placeholder="Describe what you need (deletion review, data access, etc.)"
              placeholderTextColor={colors.textMuted}
              textAlignVertical="top"
            />
            <ErrorText>{error}</ErrorText>
            {info ? <Text style={styles.info}>{info}</Text> : null}
            <SoftButton
              label={busy ? "Submitting…" : "Submit request"}
              onPress={() => void submit()}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 36 },
  note: { color: colors.textMuted, lineHeight: 20 },
  meta: { color: colors.textMuted, lineHeight: 18 },
  label: { fontWeight: "800", color: colors.text },
  area: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    backgroundColor: "#fff",
    color: colors.text,
  },
  info: { color: colors.success, fontWeight: "700" },
});
