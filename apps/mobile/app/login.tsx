import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, LOGIN_REQUEST_TIMEOUT_MS } from "../services/api";
import {
  friendlyAuthError,
  isRateLimitedAuthError,
  isValidEmail,
  routeForRole,
  shouldBindParentDeviceSession,
} from "../services/auth-errors";
import {
  consumeSessionRevokedMessage,
  getOrCreateInstallationId,
  hasPendingTvCode,
  saveActiveChild,
  saveRefreshToken,
  saveToken,
  saveUser,
} from "../services/secure";

/** Reference Siwi LearnWise login art (exact design attachment). */
const HERO = require("../assets/login-siwi-hero.jpg");

/** Architecture B: Student ID + Parent email + Admin email. */
type LoginMode = "student" | "parent" | "admin";

type AuthUserPayload = { id: string; name: string; email: string; role: string };
type AuthTokens = { accessToken: string; refreshToken?: string };

const FEATURES = [
  { key: "learn", label: "Interactive\nLearning", bg: "#7C3AED", glyph: "📘" },
  { key: "fun", label: "Fun\nActivities", bg: "#EAB308", glyph: "🎮" },
  { key: "track", label: "Track\nProgress", bg: "#2563EB", glyph: "📊" },
  { key: "safe", label: "Safe for\nChildren", bg: "#EC4899", glyph: "🛡️" },
] as const;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const passwordRef = useRef<TextInputType>(null);
  const loginRequestIdRef = useRef(0);

  /** Photo-2 is Parent email-first; keep Student/Admin tabs for Architecture B. */
  const [mode, setMode] = useState<LoginMode>("parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentLoginId, setStudentLoginId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void consumeSessionRevokedMessage().then((msg) => {
      if (msg) setInfo(msg);
    });
  }, []);

  function clearMessages() {
    setError(null);
    setFieldHint(null);
    setInfo(null);
  }

  function switchMode(next: LoginMode) {
    if (loading) return;
    setMode(next);
    clearMessages();
    setPassword("");
    setShowPassword(false);
  }

  async function persistSession(user: AuthUserPayload, tokens: AuthTokens) {
    await saveToken(tokens.accessToken);
    if (tokens.refreshToken) await saveRefreshToken(tokens.refreshToken);
    await saveUser(user);
  }

  async function onParentLogin() {
    if (loading) return;
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setFieldHint("Please enter both email and password.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setFieldHint("Enter a valid email address.");
      return;
    }

    const requestId = ++loginRequestIdRef.current;
    setLoading(true);
    try {
      const bindDevice = shouldBindParentDeviceSession(Platform.OS);
      const deviceId = bindDevice ? await getOrCreateInstallationId() : undefined;
      const data = await apiRequest<{
        user: AuthUserPayload;
        tokens: AuthTokens;
      }>("/auth/login", {
        method: "POST",
        mobile: false,
        timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          email: trimmed,
          password,
          ...(deviceId
            ? {
                deviceId,
                platform: Platform.OS,
                deviceName: `${Platform.OS} device`,
              }
            : {}),
        }),
      });
      if (loginRequestIdRef.current !== requestId) return;
      if (data.user.role !== "PARENT") {
        setError("Parent login is for Parent accounts only. Use Student or Admin if that is your role.");
        return;
      }
      await persistSession(data.user, data.tokens);
      if (await hasPendingTvCode()) {
        router.replace("/tv-connect");
        return;
      }
      router.replace(routeForRole("PARENT") as never);
    } catch (err) {
      if (loginRequestIdRef.current !== requestId) return;
      setError(friendlyAuthError(err));
      if (isRateLimitedAuthError(err)) {
        setInfo("Tip: wait a few minutes before trying again.");
      }
    } finally {
      if (loginRequestIdRef.current === requestId) setLoading(false);
    }
  }

  async function onAdminLogin() {
    if (loading) return;
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setFieldHint("Please enter both email and password.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setFieldHint("Enter a valid email address.");
      return;
    }

    const requestId = ++loginRequestIdRef.current;
    setLoading(true);
    try {
      const data = await apiRequest<{
        user: AuthUserPayload;
        tokens: AuthTokens;
      }>("/auth/login", {
        method: "POST",
        mobile: false,
        timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          email: trimmed,
          password,
        }),
      });
      if (loginRequestIdRef.current !== requestId) return;
      if (data.user.role !== "ADMIN" && data.user.role !== "SUPER_ADMIN") {
        setError("Admin login is for Admin accounts only.");
        return;
      }
      await persistSession(data.user, data.tokens);
      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      if (loginRequestIdRef.current !== requestId) return;
      setError(friendlyAuthError(err));
      if (isRateLimitedAuthError(err)) {
        setInfo("Tip: wait a few minutes before trying again.");
      }
    } finally {
      if (loginRequestIdRef.current === requestId) setLoading(false);
    }
  }

  async function onStudentLogin() {
    if (loading) return;
    clearMessages();
    const id = studentLoginId.trim();
    if (!id || !password) {
      setFieldHint("Enter your Student ID and password.");
      return;
    }

    const requestId = ++loginRequestIdRef.current;
    setLoading(true);
    try {
      const installationId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        tokens: AuthTokens;
        student: {
          childId: string;
          displayName: string;
          studentLoginId: string;
          mustChangePassword: boolean;
          levelId?: string | null;
          hasLearningSeat?: boolean;
        };
      }>("/student/auth/login", {
        method: "POST",
        body: JSON.stringify({
          studentLoginId: id,
          password,
          installationId,
          platform: Platform.OS,
          deviceName: `${Platform.OS} Learn Wise`,
        }),
        timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
        mobile: false,
      });
      if (loginRequestIdRef.current !== requestId) return;
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
        levelId: data.student.levelId ?? null,
        hasLearningSeat: data.student.hasLearningSeat ?? false,
      });
      if (data.student.mustChangePassword) {
        router.replace("/student-change-password" as never);
      } else {
        router.replace("/(tabs)/home" as never);
      }
    } catch (err) {
      if (loginRequestIdRef.current !== requestId) return;
      setError(friendlyAuthError(err));
      if (isRateLimitedAuthError(err)) {
        setInfo("Tip: wait a few minutes before trying again.");
      }
    } finally {
      if (loginRequestIdRef.current === requestId) setLoading(false);
    }
  }

  function onLoginPress() {
    if (mode === "student") void onStudentLogin();
    else if (mode === "parent") void onParentLogin();
    else void onAdminLogin();
  }

  function onForgotPress() {
    if (mode === "admin") router.push("/admin-forgot-password");
    else router.push("/forgot-password");
  }

  function onCreatePress() {
    if (mode === "student") router.push("/student-register" as never);
    else if (mode === "parent") router.push("/register");
  }

  const idPlaceholder =
    mode === "student"
      ? "Student ID (e.g. LWXXXXXXXX)"
      : mode === "admin"
        ? "Enter admin email address"
        : "Enter your email address";

  const showCreate = mode === "student" || mode === "parent";
  const createLabel = mode === "student" ? "Create Student Account" : "Create New Account";

  return (
    <View style={styles.root}>
      <ImageBackground
        source={HERO}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <LinearGradient
        colors={["rgba(180,220,255,0.15)", "rgba(255,255,255,0.55)", "rgba(232,255,220,0.85)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <KeyboardAwareScroll
        style={styles.overlay}
        contentContainerStyle={[
          styles.page,
          {
            paddingTop: Math.max(insets.top, 8) + 4,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            minHeight: winH,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={styles.brandBlock}
          accessibilityRole="header"
          accessibilityLabel="Siwi Learn Wise. Read, Spell, Learn, Succeed."
        >
          <Text style={styles.siwiMark}>
            <Text style={{ color: "#EF4444" }}>S</Text>
            <Text style={{ color: "#EAB308" }}>i</Text>
            <Text style={{ color: "#22C55E" }}>w</Text>
            <Text style={{ color: "#3B82F6" }}>i</Text>
          </Text>
          <View style={styles.learnWiseBanner}>
            <Text style={styles.learnWiseText}>LearnWise</Text>
          </View>
          <View style={styles.sloganRibbon}>
            <Text style={styles.sloganText}>Read • Spell • Learn • Succeed</Text>
          </View>
        </View>

        <View style={styles.modeRow}>
          {(
            [
              ["student", "Student"],
              ["parent", "Parent"],
              ["admin", "Admin"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === key }}
              onPress={() => switchMode(key)}
              style={[styles.modeBtn, mode === key && styles.modeBtnOn]}
            >
              <Text style={[styles.modeText, mode === key && styles.modeTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome to SiWI LearnWise</Text>
          <Text style={styles.welcomeSub}>
            {"Your Child's Learning Partner Anywhere in the World"}
          </Text>

          {mode === "student" ? (
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🆔</Text>
              <TextInput
                style={styles.input}
                value={studentLoginId}
                onChangeText={(v) => {
                  setStudentLoginId(v);
                  clearMessages();
                }}
                placeholder={idPlaceholder}
                placeholderTextColor="#9B8EC4"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel="Student ID"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          ) : (
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>✉</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearMessages();
                }}
                placeholder={idPlaceholder}
                placeholderTextColor="#9B8EC4"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
                accessibilityLabel="Email address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          )}

          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.inputPassword]}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearMessages();
              }}
              placeholder="Enter your password"
              placeholderTextColor="#9B8EC4"
              secureTextEntry={!showPassword}
              editable={!loading}
              accessibilityLabel="Password"
              returnKeyType="go"
              onSubmitEditing={onLoginPress}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={8}
              onPress={() => setShowPassword((s) => !s)}
              style={styles.eyeBtn}
            >
              <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
            </Pressable>
          </View>

          {(fieldHint || error || info || loading) && (
            <View style={styles.messageBox} accessibilityRole="alert">
              {loading ? <Text style={styles.info}>Please wait…</Text> : null}
              {fieldHint ? <Text style={styles.hint}>{fieldHint}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log In"
            disabled={loading}
            onPress={onLoginPress}
            style={({ pressed }) => [(pressed || loading) && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={["#7C3AED", "#DB2777"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.loginBtn}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Log In</Text>
                  <View style={styles.loginArrow}>
                    <Text style={styles.loginArrowText}>→</Text>
                  </View>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            onPress={onForgotPress}
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {showCreate ? (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <View style={styles.orBubble}>
                  <Text style={styles.orText}>or</Text>
                </View>
                <View style={styles.orLine} />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={createLabel}
                onPress={onCreatePress}
                style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.createIcon}>👤+</Text>
                <Text style={styles.createText}>{createLabel}</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        <View style={styles.featureRow}>
          {FEATURES.map((f) => (
            <View key={f.key} style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: f.bg }]}>
                <Text style={styles.featureGlyph}>{f.glyph}</Text>
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#B8E0FF" },
  overlay: { flex: 1 },
  page: { paddingHorizontal: 18, gap: 12, justifyContent: "flex-start" },
  brandBlock: { alignItems: "center", marginBottom: 2 },
  siwiMark: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.18)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },
  learnWiseBanner: {
    marginTop: -6,
    backgroundColor: "#6D28D9",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  learnWiseText: { color: "#fff", fontWeight: "800", fontSize: 18, letterSpacing: 0.5 },
  sloganRibbon: {
    marginTop: 8,
    backgroundColor: "#FACC15",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#EAB308",
  },
  sloganText: { fontWeight: "800", color: "#5B21B6", fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 6 },
  modeBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C4B5FD",
  },
  modeBtnOn: {
    backgroundColor: "#6D28D9",
    borderColor: "#6D28D9",
  },
  modeText: { fontWeight: "800", color: "#5B5675", fontSize: 13 },
  modeTextOn: { color: "#fff" },
  card: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 28,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(109,40,217,0.12)",
    shadowColor: "#4C1D95",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  welcome: {
    fontSize: 22,
    fontWeight: "800",
    color: "#5B21B6",
    textAlign: "center",
  },
  welcomeSub: {
    textAlign: "center",
    color: "#1E3A8A",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 17,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#DDD6FE",
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputIcon: { marginRight: 8, fontSize: 16, color: "#7C3AED" },
  input: { flex: 1, fontSize: 16, color: "#111827", paddingVertical: 10 },
  inputPassword: { paddingRight: 4 },
  eyeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  eyeText: { fontSize: 16 },
  messageBox: { gap: 4 },
  hint: { color: "#7C3AED", fontWeight: "600", fontSize: 13 },
  error: { color: "#B91C1C", fontWeight: "600", fontSize: 13 },
  info: { color: "#5B5675", fontWeight: "600", fontSize: 13 },
  loginBtn: {
    marginTop: 2,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loginBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  loginArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  loginArrowText: { color: "#fff", fontWeight: "800" },
  forgotBtn: { alignItems: "center", paddingVertical: 4 },
  forgotText: { color: "#6D28D9", fontWeight: "700", fontSize: 14 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: "#E9D5FF" },
  orBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  orText: { color: "#6B7280", fontWeight: "700", fontSize: 12 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#7C3AED",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  createIcon: { fontSize: 14, color: "#7C3AED", fontWeight: "800" },
  createText: { color: "#6D28D9", fontWeight: "800", fontSize: 15 },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  featureItem: { flex: 1, alignItems: "center", gap: 4 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  featureGlyph: { fontSize: 20 },
  featureLabel: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: "#1E3A8A",
    lineHeight: 13,
  },
});
