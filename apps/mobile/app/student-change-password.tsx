import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, ApiError } from "../services/api";
import { clearSession } from "../services/secure";
import { colors, radii } from "../theme";

/**
 * First-login / forced password change for Admin-issued Student credentials.
 * Revokes prior student sessions on the server; client clears local session.
 */
export default function StudentChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (loading) return;
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
      await apiRequest<{ ok: boolean }>("/student/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword, confirmPassword },
      });
      await clearSession();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <KeyboardAwareScroll contentContainerStyle={styles.scroll}>
        <Text style={styles.brand}>Learn Wise</Text>
        <Text style={styles.title}>{done ? "Password updated" : "Change password"}</Text>
        <Text style={styles.sub}>
          {done
            ? "For safety, you have been signed out on every device. Log in again with your Student ID and new password."
            : "Admin-issued passwords must be changed before continuing. At least 8 characters with a letter and a number."}
        </Text>
        <View style={styles.card}>
          {done ? (
            <Pressable
              style={styles.cta}
              onPress={() => router.replace("/login" as never)}
            >
              <Text style={styles.ctaText}>Go to Student Login</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.label}>Current password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={currentPassword}
                onChangeText={(v) => {
                  setCurrentPassword(v);
                  setError(null);
                }}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                accessibilityLabel="Current password"
              />

              <Text style={styles.label}>New password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputInRow}
                  secureTextEntry={!showNewPassword}
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    setError(null);
                  }}
                  editable={!loading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  accessibilityLabel="New password"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                  hitSlop={10}
                  disabled={loading}
                  onPress={() => setShowNewPassword((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={colors.purpleDeep ?? "#3D2E8A"}
                  />
                </Pressable>
              </View>

              <Text style={styles.label}>Confirm new password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputInRow}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    setError(null);
                  }}
                  editable={!loading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  accessibilityLabel="Confirm new password"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  hitSlop={10}
                  disabled={loading}
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={22}
                    color={colors.purpleDeep ?? "#3D2E8A"}
                  />
                </Pressable>
              </View>

              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Pressable
                style={[styles.cta, loading && styles.ctaDisabled]}
                disabled={loading}
                onPress={() => void onSubmit()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaText}>Update password</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3FF" },
  scroll: { paddingHorizontal: 22, paddingBottom: 40 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.purpleDeep ?? "#3D2E8A",
    textAlign: "center",
  },
  title: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "700",
    color: "#2D2A4A",
    textAlign: "center",
  },
  sub: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii?.lg ?? 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#4B5563", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    marginBottom: 14,
    backgroundColor: "#FAFAFC",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: "#FAFAFC",
    paddingRight: 6,
  },
  inputInRow: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  error: { color: "#B91C1C", marginBottom: 10, fontSize: 13 },
  cta: {
    backgroundColor: colors.purpleDeep ?? "#3D2E8A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
