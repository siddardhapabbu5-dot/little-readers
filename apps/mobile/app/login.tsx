import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, ApiError } from "../services/api";
import {
  friendlyAuthError,
  isValidEmail,
  routeForRole,
} from "../services/auth-errors";
import {
  consumeSessionRevokedMessage,
  getOrCreateInstallationId,
  hasPendingTvCode,
  saveRefreshToken,
  saveToken,
  saveUser,
} from "../services/secure";
import { colors, radii } from "../theme";

const BG_BOTTOM = require("../assets/login-bottom-scene.jpg");
const LOGO_BOOKS = require("../assets/login-books-logo.jpg");
const BOY = require("../assets/login-boy.jpg");
const GIRL = require("../assets/login-girl.jpg");

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const passwordRef = useRef<TextInputType>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bottomArtH = Math.max(110, Math.round(winH * 0.18));

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

  async function onEmailLogin() {
    if (loading) return;
    clearMessages();

    const trimmed = email.trim();
    if (!trimmed || !password) {
      setFieldHint("Please enter both email and password.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setFieldHint("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string; refreshToken?: string };
      }>("/auth/login", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          email: trimmed,
          password,
          deviceId,
          platform: Platform.OS,
          deviceName: `${Platform.OS} device`,
        }),
      });
      await saveToken(data.tokens.accessToken);
      if (data.tokens.refreshToken) {
        await saveRefreshToken(data.tokens.refreshToken);
      }
      await saveUser(data.user);
      if (data.user.role === "PARENT" && (await hasPendingTvCode())) {
        router.replace("/tv-connect");
        return;
      }
      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      setError(friendlyAuthError(err));
      if (err instanceof ApiError && err.status === 429) {
        setInfo("Tip: wait about a minute before trying again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.sky} />
      <Image
        source={BG_BOTTOM}
        style={[styles.bottomArt, { height: bottomArtH }]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      <KeyboardAwareScroll
          style={styles.overlay}
          contentContainerStyle={[
            styles.page,
            {
              paddingTop: Math.max(insets.top, 10) + 6,
              paddingBottom: Math.max(insets.bottom, 12) + bottomArtH + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={styles.header}
            accessibilityRole="header"
            accessibilityLabel="Learn Wise. Read, Spell, Learn, Succeed."
          >
            <View style={styles.heroRow}>
              <Image
                source={BOY}
                style={styles.mascot}
                resizeMode="contain"
                accessibilityLabel="Learn Wise boy character"
              />
              <View style={styles.brandCenter}>
                <Image
                  source={LOGO_BOOKS}
                  style={styles.booksLogo}
                  resizeMode="contain"
                  accessibilityLabel="Learn Wise books logo"
                />
                <Text style={styles.brand}>Learn Wise</Text>
                <View style={styles.pill}>
                  <Text
                    style={styles.pillText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Read • Spell • Learn • Succeed
                  </Text>
                </View>
                <Text style={styles.tagline}>
                  Learn today, Lead tomorrow
                </Text>
                <View style={styles.taglineUnderline} />
              </View>
              <Image
                source={GIRL}
                style={styles.mascot}
                resizeMode="contain"
                accessibilityLabel="Learn Wise girl character"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome Back!</Text>
            <Text style={styles.welcomeSub}>
              Sign in with your email address and password.
            </Text>
            <View style={styles.starRule}>
              <View style={styles.ruleLine} />
              <Text style={styles.star}>★</Text>
              <View style={styles.ruleLine} />
            </View>

            <>
                <View style={styles.inputRow}>
                  <Text style={styles.inputIcon} accessibilityElementsHidden>
                    ✉
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setFieldHint(null);
                      setError(null);
                    }}
                    placeholder="Enter your email address"
                    placeholderTextColor="#9B8EC4"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!loading}
                    accessibilityLabel="Email address"
                  />
                </View>

                <View style={styles.inputRow}>
                  <Text style={styles.inputIcon} accessibilityElementsHidden>
                    🔒
                  </Text>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, styles.inputPassword]}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setFieldHint(null);
                      setError(null);
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor="#9B8EC4"
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="password"
                    returnKeyType="go"
                    onSubmitEditing={() => void onEmailLogin()}
                    editable={!loading}
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    hitSlop={8}
                    onPress={() => setShowPassword((s) => !s)}
                    style={styles.eyeBtn}
                  >
                    <Text style={styles.eyeText}>
                      {showPassword ? "🙈" : "👁"}
                    </Text>
                  </Pressable>
                </View>
            </>

            {(fieldHint || error || info || loading) && (
              <View
                style={styles.messageBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {loading ? <Text style={styles.info}>Please wait…</Text> : null}
                {fieldHint ? <Text style={styles.hint}>{fieldHint}</Text> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {info ? <Text style={styles.info}>{info}</Text> : null}
              </View>
            )}

            <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log In"
                  disabled={loading}
                  onPress={() => void onEmailLogin()}
                  style={({ pressed }) => [
                    styles.loginBtn,
                    (pressed || loading) && { opacity: 0.85 },
                  ]}
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
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                  onPress={() => {
                    const e = email.trim().toLowerCase();
                    const adminForgot =
                      e.includes("admin@") || e.includes("superadmin@");
                    router.push(
                      adminForgot
                        ? "/admin-forgot-password"
                        : "/forgot-password"
                    );
                  }}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
            </>
          </View>

          <View style={styles.footer}>
            <Text style={styles.newUser}>New to Learn Wise?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Student Account"
              onPress={() => router.push("/register")}
              style={({ pressed }) => [
                styles.createBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.createIcon}>👤+</Text>
              <Text style={styles.createText}>Create Student Account</Text>
            </Pressable>
          </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#E8E2FF",
  },
  sky: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E8E2FF",
  },
  bottomArt: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    opacity: 0.95,
  },
  overlay: {
    flex: 1,
  },
  page: {
    paddingHorizontal: 20,
    gap: 12,
  },
  header: {
    alignItems: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    width: "100%",
    gap: 2,
    minHeight: 132,
  },
  mascot: {
    width: 78,
    height: 110,
  },
  brandCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingBottom: 8,
  },
  booksLogo: {
    width: 52,
    height: 44,
    marginBottom: 2,
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    color: "#3D2E8A",
    textAlign: "center",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#D8D0F5",
  },
  pillText: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 11,
  },
  tagline: {
    color: "#4C3D99",
    fontWeight: "600",
    fontStyle: "italic",
    fontSize: 11,
    textAlign: "center",
  },
  taglineUnderline: {
    width: 110,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#F5C542",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#fff",
    zIndex: 2,
    elevation: 3,
    shadowColor: "#3D2E8A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  welcome: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
  },
  welcomeSub: {
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 12,
  },
  starRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ruleLine: { flex: 1, height: 1, backgroundColor: "#E5E0F5" },
  star: { color: "#F5C542", fontSize: 11 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F4FF",
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: "#D8D0F5",
    paddingHorizontal: 10,
    minHeight: 44,
  },
  inputIcon: { fontSize: 14, marginRight: 6 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputPassword: { paddingRight: 4 },
  eyeBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeText: { fontSize: 16 },
  messageBox: {
    backgroundColor: "#FFF7ED",
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 2,
  },
  hint: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  error: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  info: { color: colors.primaryDark, fontWeight: "600", fontSize: 12 },
  loginBtn: {
    marginTop: 2,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loginBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  loginArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  loginArrowText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  otpActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  forgotBtn: {
    alignSelf: "center",
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: "center",
  },
  forgotText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  footer: {
    marginTop: 4,
    gap: 8,
    alignItems: "center",
  },
  newUser: {
    textAlign: "center",
    color: "#4C3D99",
    fontWeight: "700",
    fontSize: 12,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 44,
    paddingHorizontal: 14,
    width: "100%",
  },
  createIcon: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  createText: { color: colors.primaryDark, fontWeight: "800", fontSize: 14 },
  staffLink: {
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center",
  },
  staffLinkText: {
    color: "#7C6BB5",
    fontWeight: "600",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
