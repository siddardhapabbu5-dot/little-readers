import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  Title,
} from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { colors } from "../theme";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const raw = params.token;
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  }, [params.token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setSuccess(null);
    if (!token || token.length < 20) {
      setError("This reset link is missing or invalid.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>("/auth/reset-password", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SoftButton label="← Back to login" onPress={() => router.replace("/login")} />
          <Title>Reset password</Title>
          <Text style={styles.sub}>
            Choose a new password (at least 8 characters, with a letter and a number).
          </Text>
          <Card style={{ gap: 12, marginTop: 8 }}>
            <Field
              label="New password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading && !success}
            />
            <Field
              label="Confirm password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading && !success}
            />
            <ErrorText>{error}</ErrorText>
            {success ? <Text style={styles.ok}>{success}</Text> : null}
            {!success ? (
              <PrimaryButton
                label="Update password"
                loading={loading}
                onPress={() => void onSubmit()}
              />
            ) : (
              <PrimaryButton label="Go to login" onPress={() => router.replace("/login")} />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10 },
  sub: { color: colors.textMuted, lineHeight: 20 },
  ok: { color: colors.success, fontWeight: "700", lineHeight: 20 },
});
