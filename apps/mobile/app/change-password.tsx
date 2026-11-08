import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, Field, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { clearSession, getUser } from "../services/secure";
import { colors } from "../theme";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"]);

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getUser<{ role: string }>().then((u) => setRole(u?.role ?? null));
    }, [])
  );

  const isAdmin = role ? ADMIN_ROLES.has(role) : false;
  const rule = isAdmin
    ? "At least 12 characters, with an uppercase letter, a lowercase letter, a number and a symbol."
    : "At least 8 characters, with a letter and a number.";

  async function onSubmit() {
    setError(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all three fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      await clearSession();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Title>Password changed</Title>
          <Card style={{ gap: 12 }}>
            <Text style={styles.ok}>{done}</Text>
            <Text style={styles.sub}>
              For your safety, every phone and browser using this account has been signed out.
            </Text>
            <PrimaryButton label="Go to login" onPress={() => router.replace("/login")} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <AuthGate roles={ROLE_SETS.anyAuthed}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <SoftButton label="← Back" onPress={() => router.back()} />
            <Title>Change password</Title>
            <Text style={styles.sub}>New password: {rule}</Text>
            <Card style={{ gap: 12, marginTop: 8 }}>
              <Field
                label="Current password"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
                editable={!loading}
              />
              <Field
                label="New password"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!loading}
              />
              <Field
                label="Confirm new password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />
              <ErrorText>{error}</ErrorText>
              <PrimaryButton
                label="Change password"
                loading={loading}
                onPress={() => void onSubmit()}
              />
            </Card>
            <Text style={styles.sub}>
              Forgot your current password? Log out and use “Forgot password” on the login screen.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10 },
  sub: { color: colors.textMuted, lineHeight: 20 },
  ok: { color: colors.success, fontWeight: "700", lineHeight: 20 },
});
