import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import type { CountryCode } from "libphonenumber-js";
import { CountryCodePicker } from "../components/CountryCodePicker";
import { EmailOtpVerify } from "../components/EmailOtpVerify";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, ApiError } from "../services/api";
import { isValidEmail, routeForRole } from "../services/auth-errors";
import {
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

type PublicPrivacy = {
  published: boolean;
  message: string | null;
  policy: { version: string; title: string; publicUrl?: string | null } | null;
};

const BG_BOTTOM = require("../assets/login-bottom-scene.jpg");

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const emailRef = useRef<TextInputType>(null);
  const passwordRef = useRef<TextInputType>(null);
  const mobileRef = useRef<TextInputType>(null);

  const [parentName, setParentName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryIso, setCountryIso] = useState<CountryCode>(DEFAULT_COUNTRY_ISO);
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);
  const [privacyMeta, setPrivacyMeta] = useState<PublicPrivacy | null>(null);
  const [emailToken, setEmailToken] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const emailVerified =
    Boolean(emailToken) && verifiedEmail === guardianEmail.trim().toLowerCase();

  const bottomArtH = Math.max(100, Math.round(winH * 0.16));

  useEffect(() => {
    void apiRequest<PublicPrivacy>("/privacy/policy")
      .then(setPrivacyMeta)
      .catch(() =>
        setPrivacyMeta({
          published: false,
          message:
            "Could not load privacy policy status. Registration requires a published policy.",
          policy: null,
        })
      );
  }, []);

  function showBlockingError(message: string) {
    setError(message);
    setFieldHint(null);
    if (Platform.OS !== "web") {
      Alert.alert("Cannot create account", message);
    }
  }

  async function onRegister() {
    if (loading) return;
    setError(null);
    setFieldHint(null);
    setInfo(null);

    const name = parentName.trim();
    const email = guardianEmail.trim();
    if (name.length < 2) {
      showBlockingError("Enter the parent/guardian full name.");
      return;
    }
    if (!email || !isValidEmail(email)) {
      showBlockingError("Enter a valid parent/guardian email.");
      return;
    }
    if (!emailVerified) {
      showBlockingError(
        "Verify your email with the 6-digit code before creating the account."
      );
      return;
    }
    if (!password || password.length < 8) {
      showBlockingError("Password must be at least 8 characters.");
      return;
    }
    if (mobile.trim()) {
      const phone = validateNationalPhone(mobile, countryIso);
      if (!phone.ok) {
        showBlockingError(phone.error);
        return;
      }
    }
    if (!privacyMeta?.published || !privacyMeta.policy?.version) {
      showBlockingError(
        privacyMeta?.message ??
          "Registration is unavailable until the Privacy Policy is published."
      );
      return;
    }
    if (!acceptTerms || !acceptPrivacy || !parentalConsent) {
      showBlockingError(
        "Please review and accept Terms, Privacy Policy, and parental confirmation."
      );
      return;
    }

    setLoading(true);
    try {
      const country = findCountry(countryIso);
      const deviceId = await getOrCreateInstallationId();
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string; refreshToken?: string };
      }>("/auth/register", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          // Parent account only — add children from Parent Home (name + grade + plan).
          name,
          email,
          password,
          ...(mobile.trim()
            ? { mobile: mobile, countryCode: country.callingCode }
            : {}),
          emailVerificationToken: emailToken,
          deviceId,
          platform: Platform.OS,
          deviceName: `${Platform.OS} device`,
          acceptTerms,
          acceptPrivacy,
          parentalConsent,
          privacyPolicyVersion: privacyMeta.policy.version,
        }),
      });
      await saveToken(data.tokens.accessToken);
      if (data.tokens.refreshToken) {
        await saveRefreshToken(data.tokens.refreshToken);
      }
      await saveUser(data.user);
      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "EMAIL_IN_USE") {
          const msg =
            "This email is already registered. Log in, then add another child from Parent Home.";
          setError(msg);
          if (Platform.OS !== "web") {
            Alert.alert("Account already exists", msg, [
              { text: "Go to login", onPress: () => router.replace("/login" as never) },
              { text: "OK" },
            ]);
          }
          return;
        }
        if (err.code === "MOBILE_IN_USE" || /mobile number is already/i.test(err.message)) {
          showBlockingError(
            "This mobile number is already used on another account. Clear Mobile (it is optional) or enter a different number, then try again."
          );
          return;
        }
        // Never rewrite other 409s (policy mismatch, etc.) as "email already registered".
        showBlockingError(err.message);
        return;
      }
      showBlockingError("Student registration failed");
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
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingBottom: Math.max(insets.bottom, 12) + bottomArtH + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} accessibilityRole="header">
            Create parent account
          </Text>
          <Text style={styles.subtitle}>
            Create the parent login first. After that, add your child and choose
            their grade from Parent Home. Same account works on website and
            mobile.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Parent / guardian full name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={parentName}
                onChangeText={setParentName}
                placeholder="Your name"
                placeholderTextColor="#9B8EC4"
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!loading}
                accessibilityLabel="Parent or guardian full name"
              />
            </View>

            <Text style={styles.label}>Parent / guardian email</Text>
            <View style={styles.inputRow}>
              <TextInput
                ref={emailRef}
                style={styles.input}
                value={guardianEmail}
                onChangeText={setGuardianEmail}
                placeholder="parent@email.com"
                placeholderTextColor="#9B8EC4"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
                accessibilityLabel="Parent or guardian email"
              />
            </View>
            {emailVerified ? (
              <Text style={styles.verified}>✓ Email verified</Text>
            ) : (
              <EmailOtpVerify
                email={guardianEmail}
                purpose="REGISTER"
                disabled={loading}
                onVerified={(token) => {
                  setEmailToken(token);
                  setVerifiedEmail(guardianEmail.trim().toLowerCase());
                }}
                onAccountExists={() => {
                  const msg =
                    "This email is already registered. Log in, then add another child from Parent Home.";
                  setError(msg);
                  if (Platform.OS !== "web") {
                    Alert.alert("Account already exists", msg, [
                      { text: "Go to login", onPress: () => router.replace("/login" as never) },
                      { text: "OK" },
                    ]);
                  }
                }}
              />
            )}

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { paddingRight: 8 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#9B8EC4"
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => mobileRef.current?.focus()}
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
                <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Mobile (optional, for contact only)</Text>
            <View style={styles.inputRow}>
              <CountryCodePicker
                value={countryIso}
                disabled={loading}
                onChange={setCountryIso}
              />
              <TextInput
                ref={mobileRef}
                style={styles.input}
                value={mobile}
                onChangeText={(v) => setMobile(sanitizeNationalInput(v))}
                placeholder="Leave blank if unsure"
                placeholderTextColor="#9B8EC4"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => void onRegister()}
                editable={!loading}
                accessibilityLabel="Mobile number (optional)"
              />
            </View>
            <Text style={styles.fieldHelp}>
              Optional. Do not reuse a number already linked to another Learn Wise
              account.
            </Text>

            <View style={styles.consentBox}>
              {!privacyMeta?.published ? (
                <Text style={styles.consentWarn}>
                  {privacyMeta?.message ??
                    "Privacy Policy not published yet. Registration is disabled until an administrator publishes an approved policy."}
                </Text>
              ) : (
                <Text style={styles.consentMeta}>
                  Privacy Policy {privacyMeta.policy?.version}
                  {privacyMeta.policy?.title
                    ? ` · ${privacyMeta.policy.title}`
                    : ""}
                </Text>
              )}

              <ConsentRow
                checked={acceptTerms}
                onToggle={() => setAcceptTerms((v) => !v)}
                disabled={loading || !privacyMeta?.published}
                label="I accept the Terms of Service."
                linkLabel="View Terms"
                onLink={() => router.push({ pathname: "/legal", params: { doc: "terms" } })}
              />
              <ConsentRow
                checked={acceptPrivacy}
                onToggle={() => setAcceptPrivacy((v) => !v)}
                disabled={loading || !privacyMeta?.published}
                label={`I accept the Privacy Policy${
                  privacyMeta?.policy?.version ? ` (version ${privacyMeta.policy.version})` : ""
                }.`}
                linkLabel="View Privacy Policy"
                onLink={() => router.push({ pathname: "/legal", params: { doc: "privacy" } })}
              />
              <ConsentRow
                checked={parentalConsent}
                onToggle={() => setParentalConsent((v) => !v)}
                disabled={loading || !privacyMeta?.published}
                label="I confirm I am the parent/guardian and consent to manage my child’s learning account."
              />
            </View>

            {(fieldHint || error || info) && (
              <View
                style={[styles.messageBox, error ? styles.messageBoxError : null]}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {fieldHint ? (
                  <Text style={styles.hint}>{fieldHint}</Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {info ? <Text style={styles.info}>{info}</Text> : null}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create parent account"
              disabled={loading || !privacyMeta?.published || !emailVerified}
              onPress={() => void onRegister()}
              style={({ pressed }) => [
                styles.primaryBtn,
                (pressed || loading || !privacyMeta?.published || !emailVerified) && {
                  opacity: 0.6,
                },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? "Creating…" : "Create parent account"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to login"
              onPress={() => router.replace("/login" as never)}
              style={styles.softBtn}
            >
              <Text style={styles.softBtnText}>Already registered? Log in</Text>
            </Pressable>
          </View>
      </KeyboardAwareScroll>
    </View>
  );
}

function ConsentRow({
  checked,
  onToggle,
  disabled,
  label,
  linkLabel,
  onLink,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <View style={styles.consentRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !!disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={styles.checkHit}
      >
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.consentLabel}>{label}</Text>
        {linkLabel && onLink ? (
          <Pressable onPress={onLink} disabled={disabled}>
            <Text style={styles.consentLink}>{linkLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#E8E2FF" },
  sky: { ...StyleSheet.absoluteFillObject, backgroundColor: "#E8E2FF" },
  bottomArt: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    opacity: 0.55,
  },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    gap: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 4,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 24,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#fff",
    zIndex: 2,
    elevation: 4,
    shadowColor: "#3D2E8A",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: {
    fontWeight: "700",
    color: colors.primaryDark,
    fontSize: 13,
    marginTop: 4,
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
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
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
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 2,
    marginTop: 4,
  },
  fieldHelp: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 12,
    marginTop: -4,
    marginBottom: 2,
  },
  inputRowError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  inlineError: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 18,
  },
  messageBoxError: {
    backgroundColor: "#FEE2E2",
    borderColor: colors.danger,
    borderWidth: 1,
  },
  hint: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  verified: { color: colors.success, fontWeight: "800", fontSize: 13 },
  error: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  info: { color: colors.primaryDark, fontWeight: "600", fontSize: 12 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  softBtn: {
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 40,
  },
  softBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  consentBox: {
    marginTop: 8,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D8CFF5",
  },
  consentWarn: { color: colors.danger, fontWeight: "700", fontSize: 12, lineHeight: 17 },
  consentMeta: { color: colors.primaryDark, fontWeight: "700", fontSize: 12 },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkHit: { paddingTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: colors.primary },
  checkMark: { color: "#fff", fontWeight: "900", fontSize: 12, lineHeight: 14 },
  consentLabel: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  consentLink: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
