import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, ApiError } from "../services/api";
import {
  friendlyAuthError,
  isValidEmail,
  routeForRole,
} from "../services/auth-errors";
import {
  consumeSessionRevokedMessage,
  getOrCreateInstallationId,
  saveRefreshToken,
  saveToken,
  saveUser,
} from "../services/secure";
import { colors, radii } from "../theme";

/** One scene only — books, kids, grass, bottom books / open book / cup */
const LOGIN_SCENE = require("../assets/login-bg-scene.jpg");

type LoginMode = "parent_otp" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputType>(null);
  const otpRef = useRef<TextInputType>(null);

  const [mode, setMode] = useState<LoginMode>("parent_otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void consumeSessionRevokedMessage().then((msg) => {
      if (msg) setInfo(msg);
    });
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function switchMode(next: LoginMode) {
    setMode(next);
    setError(null);
    setFieldHint(null);
    setInfo(null);
    setOtpSent(false);
    setOtp("");
    setDevOtp(null);
  }

  async function onSendOtp() {
    if (loading) return;
    setError(null);
    setInfo(null);
    setFieldHint(null);
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 10) {
      setFieldHint("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{
        mobileE164: string;
        expiresInSec: number;
        resendInSec: number;
        message: string;
        devOtp?: string;
      }>("/parent/auth/send-otp", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({ mobile: digits, countryCode: "+91" }),
      });
      setOtpSent(true);
      setResendIn(data.resendInSec ?? 60);
      setDevOtp(data.devOtp ?? null);
      setInfo("OTP sent. Check your SMS.");
      if (data.devOtp) {
        setOtp(data.devOtp);
        setInfo(`Dev OTP: ${data.devOtp}`);
      }
      otpRef.current?.focus();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    if (loading) return;
    setError(null);
    setInfo(null);
    setFieldHint(null);
    const digits = mobile.replace(/\D/g, "");
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setFieldHint("Enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string; refreshToken?: string };
      }>("/parent/auth/verify-otp", {
        method: "POST",
        mobile: true,
        body: JSON.stringify({
          mobile: digits,
          countryCode: "+91",
          otp: code,
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
      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onEmailLogin() {
    if (loading) return;
    setError(null);
    setInfo(null);
    setFieldHint(null);

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
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string };
      }>("/auth/login", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({ email: trimmed, password }),
      });
      await saveToken(data.tokens.accessToken);
      await saveUser(data.user);
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
      <Image
        source={LOGIN_SCENE}
        style={styles.scene}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View
          style={[
            styles.page,
            {
              paddingTop: Math.max(insets.top, 8) + 72,
              paddingBottom: Math.max(insets.bottom, 8) + 120,
            },
          ]}
        >
          <View
            style={styles.header}
            accessibilityRole="header"
            accessibilityLabel="Little Readers. Learn, Listen, Spell."
          >
            <Text style={styles.brand}>Little Readers</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Learn • Listen • Spell</Text>
            </View>
            <Text style={styles.tagline}>A little learning, a big adventure!</Text>
            <View style={styles.taglineUnderline} />
          </View>

          <View style={styles.mascotGap} pointerEvents="none" />

          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome Back!</Text>
            <Text style={styles.welcomeSub}>
              {mode === "parent_otp"
                ? "Parents: sign in with your mobile number (OTP)."
                : "Sign in with email and password (Parent, Admin, or Super)."}
            </Text>
            <View style={styles.starRule}>
              <View style={styles.ruleLine} />
              <Text style={styles.star}>★</Text>
              <View style={styles.ruleLine} />
            </View>

            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Parent OTP login"
                onPress={() => switchMode("parent_otp")}
                style={[
                  styles.modeBtn,
                  mode === "parent_otp" && styles.modeBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "parent_otp" && styles.modeBtnTextActive,
                  ]}
                >
                  Parent OTP
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Email and password login"
                onPress={() => switchMode("email")}
                style={[
                  styles.modeBtn,
                  mode === "email" && styles.modeBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "email" && styles.modeBtnTextActive,
                  ]}
                >
                  Email
                </Text>
              </Pressable>
            </View>

            {__DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEMO !== "0" ? (
              <View style={styles.devRow} accessibilityLabel="Demo quick login">
                <Text style={styles.devLabel}>Demo (tap to fill)</Text>
                <View style={styles.devBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fill parent demo email login"
                    onPress={() => {
                      switchMode("email");
                      setEmail("parent@littlereaders.test");
                      setPassword("ParentDemo1");
                      setError(null);
                      setFieldHint(null);
                      setInfo(null);
                    }}
                    style={styles.devBtn}
                  >
                    <Text style={styles.devBtnText}>Parent</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fill admin demo login"
                    onPress={() => {
                      switchMode("email");
                      setEmail("admin@littlereaders.test");
                      setPassword("AdminDemo1");
                      setError(null);
                      setFieldHint(null);
                      setInfo(null);
                    }}
                    style={styles.devBtn}
                  >
                    <Text style={styles.devBtnText}>Admin</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fill super admin demo login"
                    onPress={() => {
                      switchMode("email");
                      setEmail("superadmin@littlereaders.test");
                      setPassword("SuperDemo1");
                      setError(null);
                      setFieldHint(null);
                      setInfo(null);
                    }}
                    style={styles.devBtn}
                  >
                    <Text style={styles.devBtnText}>Super</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {mode === "parent_otp" ? (
              <>
                <View style={styles.inputRow}>
                  <Text style={styles.cc}>+91</Text>
                  <TextInput
                    style={styles.input}
                    value={mobile}
                    onChangeText={(v) => {
                      setMobile(v.replace(/[^\d]/g, "").slice(0, 10));
                      setFieldHint(null);
                      setError(null);
                      if (otpSent) {
                        setOtpSent(false);
                        setOtp("");
                        setDevOtp(null);
                      }
                    }}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#9B8EC4"
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    editable={!loading}
                    accessibilityLabel="Mobile number"
                  />
                </View>

                {otpSent ? (
                  <View style={styles.inputRow}>
                    <Text style={styles.inputIcon} accessibilityElementsHidden>
                      #
                    </Text>
                    <TextInput
                      ref={otpRef}
                      style={styles.input}
                      value={otp}
                      onChangeText={(v) => {
                        setOtp(v.replace(/\D/g, "").slice(0, 6));
                        setFieldHint(null);
                        setError(null);
                      }}
                      placeholder="6-digit OTP"
                      placeholderTextColor="#9B8EC4"
                      keyboardType="number-pad"
                      editable={!loading}
                      accessibilityLabel="OTP code"
                      onSubmitEditing={() => void onVerifyOtp()}
                    />
                  </View>
                ) : null}
              </>
            ) : (
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
            )}

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

            {mode === "parent_otp" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={otpSent ? "Verify OTP" : "Send OTP"}
                  disabled={loading}
                  onPress={() =>
                    void (otpSent ? onVerifyOtp() : onSendOtp())
                  }
                  style={({ pressed }) => [
                    styles.loginBtn,
                    (pressed || loading) && { opacity: 0.85 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.loginBtnText}>
                        {otpSent ? "Verify & Log In" : "Send OTP"}
                      </Text>
                      <View style={styles.loginArrow}>
                        <Text style={styles.loginArrowText}>→</Text>
                      </View>
                    </>
                  )}
                </Pressable>
                {otpSent ? (
                  <View style={styles.otpActions}>
                    <Pressable
                      disabled={loading || resendIn > 0}
                      onPress={() => void onSendOtp()}
                      style={styles.forgotBtn}
                    >
                      <Text style={styles.forgotText}>
                        {resendIn > 0
                          ? `Resend OTP in ${resendIn}s`
                          : "Resend OTP"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setOtpSent(false);
                        setOtp("");
                        setDevOtp(null);
                        setInfo(null);
                      }}
                      style={styles.forgotBtn}
                    >
                      <Text style={styles.forgotText}>Change number</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Forgot mobile number, contact support"
                  onPress={() => {
                    void (async () => {
                      try {
                        const data = await apiRequest<{
                          email: string;
                          message: string;
                        }>("/parent/auth/support-contact", {
                          method: "GET",
                          mobile: false,
                        });
                        setInfo(data.message);
                        const mailto = `mailto:${data.email}?subject=${encodeURIComponent(
                          "Little Readers – forgot registered mobile"
                        )}`;
                        await Linking.openURL(mailto);
                      } catch {
                        setInfo(
                          "Contact support@littlereaders.example if you forgot your registered mobile. We will not change it using only an OTP to a new number."
                        );
                      }
                    })();
                  }}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>
                    Forgot mobile? Contact support
                  </Text>
                </Pressable>
              </>
            ) : (
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
                      adminForgot ? "/admin-forgot-password" : "/forgot-password"
                    );
                  }}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.newUser}>New to Little Readers?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Parent Account"
              onPress={() => router.push("/register")}
              style={({ pressed }) => [
                styles.createBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.createIcon}>👤+</Text>
              <Text style={styles.createText}>Create Parent Account</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#E8E2FF",
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  overlay: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "flex-start",
  },
  header: {
    alignItems: "center",
    gap: 2,
  },
  brand: {
    fontSize: 26,
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
    fontSize: 12,
    textAlign: "center",
  },
  taglineUnderline: {
    width: 110,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#F5C542",
  },
  mascotGap: {
    height: 56,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: "#fff",
  },
  welcome: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D4CBF5",
    backgroundColor: "#F7F4FF",
    paddingVertical: 8,
    alignItems: "center",
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeBtnText: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 13,
  },
  modeBtnTextActive: {
    color: "#fff",
  },
  devRow: {
    gap: 4,
    marginBottom: 2,
  },
  devLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#7C6BB5",
    textAlign: "center",
  },
  devBtns: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  devBtn: {
    backgroundColor: "#F0EBFF",
    borderWidth: 1,
    borderColor: "#D4CBF5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "center",
  },
  devBtnText: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 12,
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
    minHeight: 40,
  },
  cc: {
    fontWeight: "800",
    color: colors.primaryDark,
    marginRight: 8,
    fontSize: 14,
  },
  inputIcon: { fontSize: 14, marginRight: 6 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 6,
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
    minHeight: 42,
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
    paddingVertical: 2,
    minHeight: 28,
    justifyContent: "center",
  },
  forgotText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  footer: {
    marginTop: 10,
    gap: 4,
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
    minHeight: 40,
    paddingHorizontal: 14,
    width: "100%",
  },
  createIcon: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  createText: { color: colors.primaryDark, fontWeight: "800", fontSize: 14 },
});
