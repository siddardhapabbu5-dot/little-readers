import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { Link, useRouter } from "expo-router";
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
import { routeForRole } from "../services/auth-errors";
import { saveToken, saveUser } from "../services/secure";
import { colors } from "../theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string };
      }>("/auth/register", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          acceptTerms: true,
          acceptPrivacy: true,
          parentalConsent: true,
        }),
      });
      await saveToken(data.tokens.accessToken);
      await saveUser(data.user);
      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Title>Parent signup</Title>
          <Text style={{ color: colors.textMuted }}>
            Same account works on website and mobile.
          </Text>
          <Card style={{ gap: 12, marginTop: 12 }}>
            <Field label="Full name" value={name} onChangeText={setName} />
            <Field
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <ErrorText>{error}</ErrorText>
            <PrimaryButton
              label="Create account"
              onPress={() => void onRegister()}
              loading={loading}
            />
            <SoftButton label="Back to login" onPress={() => router.back()} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 8 },
});
