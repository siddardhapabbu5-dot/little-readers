import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CountryCode } from "libphonenumber-js";
import { CountryCodePicker } from "../components/CountryCodePicker";
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
import {
  DEFAULT_COUNTRY_ISO,
  findCountry,
  sanitizeNationalInput,
  validateNationalPhone,
} from "../utils/phone";

const BG_BOTTOM = require("../assets/login-bottom-scene.jpg");
const LOGO_BOOKS = require("../assets/login-books-logo.jpg");
const BOY = require("../assets/login-boy.jpg");
const GIRL = require("../assets/login-girl.jpg");

/** Staff/admin email login is hidden from the main student OTP UI. */
type VisibleMode = "student_otp" | "staff_email";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInputType>(null);
  const otpRef = useRef<TextInputType>(null);
  const emailFieldY = useRef(0);
  const passwordFieldY = useRef(0);

  const [mode, setMode] = useState<VisibleMode>("student_otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryIso, setCountryIso] = useState<CountryCode>(DEFAULT_COUNTRY_ISO);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
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

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function clearMessages() {
    setError(null);
    setFieldHint(null);
    setInfo(null);
  }

  function scrollToY(y: number) {
    // Keep focused field visible without jumping to top.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 24),
        animated: true,
      });
    });
  }

  async function onSendOtp() {
    if (loading) return;
    clearMessages();
    const checked = validateNationalPhone(mobile, countryIso);
    if (!checked.ok) {
      setFieldHint(checked.error);
      return;
    }
    setLoading(true);
    try {
      const country = findCountry(countryIso);
      const data = await apiRequest<{
        mobileE164: string;
        expiresInSec: number;
        resendInSec: number;
        message: string;
        devOtp?: string;
      }>("/parent/auth/send-otp", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          mobile: mobile,
          countryCode: country.callingCode,
        }),
      });
      setOtpSent(true);
      setResendIn(data.resendInSec ?? 60);
      setInfo("Student OTP sent. Check your SMS.");
      if (data.devOtp) {
        setOtp(data.devOtp);
        setInfo(`Dev Student OTP: ${data.devOtp}`);
      }
      otpRef.current?.focus();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.details &&
        typeof err.details === "object" &&
        "code" in err.details &&
        (err.details as { code?: string }).code === "SMS_FAILED"
      ) {
        setError(
          "Could not send OTP. SMS is not configured or the provider failed. Ask an admin to check SMS settings — login is not skipped."
        );
      } else {
        setError(friendlyAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    if (loading) return;
    clearMessages();
    const checked = validateNationalPhone(mobile, countryIso);
    if (!checked.ok) {
      setFieldHint(checked.error);
      return;
    }
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setFieldHint("Enter the 6-digit Student OTP.");
      return;
    }
    setLoading(true);
    try {
      const country = findCountry(countryIso);
      const deviceId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string; refreshToken?: string };
      }>("/parent/auth/verify-otp", {
        method: "POST",
        mobile: true,
        body: JSON.stringify({
          mobile: mobile,
          countryCode: country.callingCode,
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
      <View style={styles.sky} />
      <Image
        source={BG_BOTTOM}
        style={[styles.bottomArt, { height: bottomArtH }]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.overlay}
          contentContainerStyle={[
            styles.page,
            {
              paddingTop: Math.max(insets.top, 10) + 6,
              paddingBottom: Math.max(insets.bottom, 12) + bottomArtH + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View
            style={styles.header}
            accessibilityRole="header"
            accessibilityLabel="Little Readers. Learn, Listen, Spell."
          >
            <View style={styles.heroRow}>
              <Image
                source={BOY}
                style={styles.mascot}
                resizeMode="contain"
                accessibilityLabel="Little Readers boy character"
              />
              <View style={styles.brandCenter}>
                <Image
                  source={LOGO_BOOKS}
                  style={styles.booksLogo}
                  resizeMode="contain"
                  accessibilityLabel="Little Readers books logo"
                />
                <Text style={styles.brand}>Little Readers</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Learn • Listen • Spell</Text>
                </View>
                <Text style={styles.tagline}>
                  A little learning, a big adventure!
                </Text>
                <View style={styles.taglineUnderline} />
              </View>
              <Image
                source={GIRL}
                style={styles.mascot}
                resizeMode="contain"
                accessibilityLabel="Little Readers girl character"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome Back!</Text>
            <Text style={styles.welcomeSub}>
              {mode === "student_otp"
                ? "Sign in with Student OTP on your registered mobile."
                : "Staff sign-in (Admin / Super Admin)."}
            </Text>
            <View style={styles.starRule}>
              <View style={styles.ruleLine} />
              <Text style={styles.star}>★</Text>
              <View style={styles.ruleLine} />
            </View>

            {__DEV__ &&
            process.env.EXPO_PUBLIC_ENABLE_DEMO !== "0" &&
            mode === "staff_email" ? (
              <View style={styles.devRow} accessibilityLabel="Demo quick login">
                <Text style={styles.devLabel}>Demo (tap to fill)</Text>
                <View style={styles.devBtns}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fill admin demo login"
                    onPress={() => {
                      setEmail("admin@littlereaders.test");
                      setPassword("AdminDemo1");
                      clearMessages();
                    }}
                    style={styles.devBtn}
                  >
                    <Text style={styles.devBtnText}>Admin</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fill super admin demo login"
                    onPress={() => {
                      setEmail("superadmin@littlereaders.test");
                      setPassword("SuperDemo1");
                      clearMessages();
                    }}
                    style={styles.devBtn}
                  >
                    <Text style={styles.devBtnText}>Super</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {mode === "student_otp" ? (
              <>
                <View style={styles.inputRow}>
                  <CountryCodePicker
                    value={countryIso}
                    disabled={loading}
                    onChange={(iso) => {
                      setCountryIso(iso);
                      setFieldHint(null);
                      setError(null);
                      if (otpSent) {
                        setOtpSent(false);
                        setOtp("");
                      }
                    }}
                  />
                  <TextInput
                    style={styles.input}
                    value={mobile}
                    onChangeText={(v) => {
                      setMobile(sanitizeNationalInput(v));
                      setFieldHint(null);
                      setError(null);
                      if (otpSent) {
                        setOtpSent(false);
                        setOtp("");
                      }
                    }}
                    placeholder="Mobile number"
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
                      placeholder="6-digit Student OTP"
                      placeholderTextColor="#9B8EC4"
                      keyboardType="number-pad"
                      editable={!loading}
                      accessibilityLabel="Student OTP code"
                      onSubmitEditing={() => void onVerifyOtp()}
                    />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View
                  style={styles.inputRow}
                  onLayout={(e) => {
                    emailFieldY.current = e.nativeEvent.layout.y;
                  }}
                >
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
                    onFocus={() => scrollToY(emailFieldY.current + 160)}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!loading}
                    accessibilityLabel="Email address"
                  />
                </View>

                <View
                  style={styles.inputRow}
                  onLayout={(e) => {
                    passwordFieldY.current = e.nativeEvent.layout.y;
                  }}
                >
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
                    onFocus={() => scrollToY(passwordFieldY.current + 200)}
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

            {mode === "student_otp" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    otpSent ? "Verify Student OTP" : "Send Student OTP"
                  }
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
                        {otpSent ? "Verify Student OTP" : "Send Student OTP"}
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
                          ? `Resend Student OTP in ${resendIn}s`
                          : "Resend Student OTP"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setOtpSent(false);
                        setOtp("");
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
                      adminForgot
                        ? "/admin-forgot-password"
                        : "/forgot-password"
                    );
                  }}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to Student OTP"
                  onPress={() => {
                    setMode("student_otp");
                    clearMessages();
                  }}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>← Back to Student OTP</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.newUser}>New to Little Readers?</Text>
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
            {mode === "student_otp" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Staff sign-in for Admin or Super Admin"
                onPress={() => {
                  setMode("staff_email");
                  clearMessages();
                }}
                style={styles.staffLink}
              >
                <Text style={styles.staffLinkText}>Staff sign-in</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
