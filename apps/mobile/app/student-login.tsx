import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, LOGIN_REQUEST_TIMEOUT_MS } from "../services/api";
import { friendlyAuthError, isRateLimitedAuthError } from "../services/auth-errors";
import {
  getOrCreateInstallationId,
  saveActiveChild,
  saveRefreshToken,
  saveToken,
  saveUser,
} from "../services/secure";
import { colors, radii } from "../theme";

/**
 * Architecture B — shared Student ID + Password login (Option A and B).
 * Parent/Admin email login remains on /login.
 */
export default function StudentLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputType>(null);
  const [studentLoginId, setStudentLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (loading) return;
    setError(null);
    const id = studentLoginId.trim();
    if (!id || !password) {
      setError("Enter your Student ID and password.");
      return;
    }
    setLoading(true);
    try {
      const installationId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        tokens: { accessToken: string; refreshToken?: string };
        student: {
          childId: string;
          displayName: string;
          studentLoginId: string;
          mustChangePassword: boolean;
        };
      }>("/student/auth/login", {
        method: "POST",
        body: {
          studentLoginId: id,
          password,
          installationId,
          platform: "android",
          deviceName: "Learn Wise Mobile",
        },
        timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
        mobile: false,
      });
      await saveToken(data.tokens.accessToken);
      if (data.tokens.refreshToken) await saveRefreshToken(data.tokens.refreshToken);
      await saveUser({
        id: data.student.childId,
        email: data.student.studentLoginId,
        name: data.student.displayName,
        role: "STUDENT",
      } as never);
      await saveActiveChild({
        id: data.student.childId,
        displayName: data.student.displayName,
        birthYear: 2000,
        level: "LEVEL_1",
        levelId: null,
        hasLearningSeat: false,
      });
      if (data.student.mustChangePassword) {
        router.replace("/student-change-password" as never);
      } else {
        router.replace("/(tabs)/home" as never);
      }
    } catch (e) {
      setError(
        isRateLimitedAuthError(e)
          ? "Too many attempts. Please wait and try again."
          : friendlyAuthError(e)
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <KeyboardAwareScroll contentContainerStyle={styles.scroll}>
        <Text style={styles.brand}>Learn Wise</Text>
        <Text style={styles.title}>Student Login</Text>
        <Text style={styles.sub}>Sign in with your Student ID and password.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Student ID</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            value={studentLoginId}
            onChangeText={setStudentLoginId}
            placeholder="e.g. LWXXXXXXXX"
            placeholderTextColor="#9AA0B5"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#9AA0B5"
              returnKeyType="go"
              onSubmitEditing={() => void onLogin()}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={styles.show}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.cta, loading && styles.ctaDisabled]}
            disabled={loading}
            onPress={() => void onLogin()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Log In</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace("/login" as never)} style={styles.linkWrap}>
          <Text style={styles.link}>Parent / Admin email login</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/student-register" as never)}
          style={styles.linkWrap}
        >
          <Text style={styles.link}>New student? Register with email</Text>
        </Pressable>
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
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 64 },
  show: {
    position: "absolute",
    right: 14,
    top: 14,
    color: colors.purpleDeep ?? "#3D2E8A",
    fontWeight: "600",
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
  linkWrap: { marginTop: 16, alignItems: "center" },
  link: { color: colors.purpleDeep ?? "#3D2E8A", fontWeight: "600", fontSize: 14 },
});
