import { useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
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
import { isValidEmail, routeForRole } from "../services/auth-errors";
import { saveActiveChild, saveToken, saveUser } from "../services/secure";
import { colors, radii } from "../theme";
import {
  DEFAULT_COUNTRY_ISO,
  findCountry,
  sanitizeNationalInput,
  validateNationalPhone,
} from "../utils/phone";

const BG_BOTTOM = require("../assets/login-bottom-scene.jpg");

function formatBirthdayInput(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const emailRef = useRef<TextInputType>(null);
  const passwordRef = useRef<TextInputType>(null);
  const mobileRef = useRef<TextInputType>(null);
  const birthRef = useRef<TextInputType>(null);

  const [studentName, setStudentName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryIso, setCountryIso] = useState<CountryCode>(DEFAULT_COUNTRY_ISO);
  const [mobile, setMobile] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bottomArtH = Math.max(100, Math.round(winH * 0.16));

  function scrollFieldIntoView(y: number) {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
    });
  }

  async function onRegister() {
    if (loading) return;
    setError(null);
    setFieldHint(null);
    setInfo(null);

    const name = studentName.trim();
    const email = guardianEmail.trim();
    if (name.length < 2) {
      setFieldHint("Enter the student’s full name.");
      return;
    }
    if (!email || !isValidEmail(email)) {
      setFieldHint("Enter a valid parent/guardian email.");
      return;
    }
    if (!password || password.length < 8) {
      setFieldHint("Password must be at least 8 characters.");
      return;
    }
    const phone = validateNationalPhone(mobile, countryIso);
    if (!phone.ok) {
      setFieldHint(phone.error);
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate.trim())) {
      setFieldHint("Enter student birthday as DD/MM/YYYY.");
      return;
    }

    setLoading(true);
    try {
      const country = findCountry(countryIso);
      const data = await apiRequest<{
        user: { id: string; name: string; email: string; role: string };
        tokens: { accessToken: string };
      }>("/auth/register", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          // Guardian User (PARENT role) owns the student Child profile.
          name,
          email,
          password,
          mobile: mobile,
          countryCode: country.callingCode,
          acceptTerms: true,
          acceptPrivacy: true,
          parentalConsent: true,
        }),
      });
      await saveToken(data.tokens.accessToken);
      await saveUser(data.user);

      try {
        const child = await apiRequest<{
          id: string;
          displayName: string;
          birthYear: number;
          level: string;
          levelId?: string | null;
        }>("/children", {
          method: "POST",
          token: data.tokens.accessToken,
          mobile: true,
          body: JSON.stringify({
            displayName: name,
            birthDate: birthDate.trim(),
          }),
        });
        await saveActiveChild(child);
        setInfo("Student account created and linked to your guardian login.");
      } catch (childErr) {
        // Guardian account exists; student profile can be added from Parent home.
        setInfo(
          childErr instanceof ApiError
            ? `Account created. Add the student profile next: ${childErr.message}`
            : "Account created. Add the student profile from the Parent screen."
        );
      }

      router.replace(routeForRole(data.user.role) as never);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Student registration failed"
      );
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
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingBottom: Math.max(insets.bottom, 12) + bottomArtH + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <Text style={styles.title} accessibilityRole="header">
            Create Student Account
          </Text>
          <Text style={styles.subtitle}>
            Register the student and link them to a parent/guardian login. Same
            account works on website and mobile.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Student full name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={studentName}
                onChangeText={setStudentName}
                placeholder="Student’s name"
                placeholderTextColor="#9B8EC4"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!loading}
                accessibilityLabel="Student full name"
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
                onFocus={() => scrollFieldIntoView(120)}
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
                accessibilityLabel="Parent or guardian email"
              />
            </View>

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
                onFocus={() => scrollFieldIntoView(200)}
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

            <Text style={styles.label}>Mobile (Student OTP login)</Text>
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
                placeholder="Mobile number"
                placeholderTextColor="#9B8EC4"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                returnKeyType="next"
                onFocus={() => scrollFieldIntoView(280)}
                onSubmitEditing={() => birthRef.current?.focus()}
                editable={!loading}
                accessibilityLabel="Mobile number for Student OTP"
              />
            </View>

            <Text style={styles.label}>Student birthday (DD/MM/YYYY)</Text>
            <View style={styles.inputRow}>
              <TextInput
                ref={birthRef}
                style={styles.input}
                value={birthDate}
                onChangeText={(v) => setBirthDate(formatBirthdayInput(v))}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#9B8EC4"
                keyboardType="number-pad"
                returnKeyType="done"
                onFocus={() => scrollFieldIntoView(360)}
                onSubmitEditing={() => void onRegister()}
                editable={!loading}
                accessibilityLabel="Student birthday"
              />
            </View>

            {(fieldHint || error || info) && (
              <View
                style={styles.messageBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
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
              accessibilityLabel="Create Student Account"
              disabled={loading}
              onPress={() => void onRegister()}
              style={({ pressed }) => [
                styles.primaryBtn,
                (pressed || loading) && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? "Creating…" : "Create Student Account"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to login"
              onPress={() => router.back()}
              style={styles.softBtn}
            >
              <Text style={styles.softBtnText}>Back to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  hint: { color: colors.accent, fontWeight: "700", fontSize: 12 },
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
});
