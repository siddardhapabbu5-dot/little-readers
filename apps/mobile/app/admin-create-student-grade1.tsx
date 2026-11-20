import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "../components/keyboard";
import { apiRequest, ApiError } from "../services/api";
import { routeForRole } from "../services/auth-errors";
import { getToken, getUser } from "../services/secure";
import { colors, radii } from "../theme";

type Step = "email" | "otp" | "details" | "confirm" | "handover";

type LearnWiseGrade = {
  levelId: string;
  levelCode: string;
  gradeNumber: number | null;
  gradeLabel: string;
  available: boolean;
};

type CreateChildResult = {
  id: string;
  displayName: string;
  level?: string;
  levelId?: string | null;
  hasLearningSeat?: boolean;
  subscriptionStatus?: string;
};

type IssuedCredentials = {
  credentialId?: string;
  childId: string;
  studentLoginId: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
};

type CreateResponse = {
  child: CreateChildResult;
  credentials: IssuedCredentials | null;
  accountCreationMethod?: string;
};

const SHARED_MAILBOX = "littlereaders.otp@gmail.com";

/**
 * Grade 1 Admin Create Student — OTP-gated provisioning.
 * Uses shared Admin mailbox OTP + system sponsor (no Parent picker, no Admin Direct UI).
 * Temporary passwords must not be logged.
 */
export default function AdminCreateStudentGrade1Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [step, setStep] = useState<Step>("email");

  const [grade1, setGrade1] = useState<LearnWiseGrade | null>(null);
  const [sharedEmail, setSharedEmail] = useState(SHARED_MAILBOX);
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [destinationHint, setDestinationHint] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("2018");
  const [preferredStudentLoginId, setPreferredStudentLoginId] = useState("");
  const [idSuggestions, setIdSuggestions] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [createdChild, setCreatedChild] = useState<CreateChildResult | null>(null);
  const [handoverAcknowledged, setHandoverAcknowledged] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  function formatValidationDetails(details: unknown): string | null {
    if (!details || typeof details !== "object") return null;
    const d = details as {
      issues?: {
        fieldErrors?: Record<string, string[] | undefined>;
        formErrors?: string[];
      };
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const fieldErrors = d.issues?.fieldErrors ?? d.fieldErrors;
    const formErrors = d.issues?.formErrors ?? [];
    const labels: Record<string, string> = {
      parentId: "Parent",
      displayName: "Student display name",
      birthYear: "Birth year",
      birthDate: "Birthday",
      levelId: "Grade",
      level: "Grade",
      preferredStudentLoginId: "Student ID",
      verificationToken: "Email verification",
      gradeId: "School grade",
    };
    const parts: string[] = [];
    if (fieldErrors && typeof fieldErrors === "object") {
      // Production still requiring parentId while this app omits it (sponsor flow).
      const parentMsgs = fieldErrors.parentId ?? [];
      if (parentMsgs.length) {
        return "Server still expects a Parent ID for this create API. The OTP sponsor create update is not deployed yet — Student ID is fine; ask for a backend deploy, then try again.";
      }
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (!msgs?.length) continue;
        const label = labels[key] ?? key;
        parts.push(`${label}: ${msgs.join("; ")}`);
      }
    }
    for (const msg of formErrors) {
      if (msg?.trim()) parts.push(msg.trim());
    }
    return parts.length ? parts.join("\n") : null;
  }

  function mapError(err: unknown): string {
    if (err instanceof ApiError) {
      const code =
        err.code ??
        (err.details &&
        typeof err.details === "object" &&
        err.details !== null &&
        "code" in err.details
          ? String((err.details as { code?: unknown }).code ?? "")
          : undefined);

      const suggestions =
        err.details &&
        typeof err.details === "object" &&
        err.details !== null &&
        "suggestions" in err.details &&
        Array.isArray((err.details as { suggestions?: unknown }).suggestions)
          ? ((err.details as { suggestions: string[] }).suggestions ?? [])
          : [];

      if (suggestions.length) setIdSuggestions(suggestions);

      if (err.status === 0 || code === "NETWORK_UNAVAILABLE") {
        return "Could not reach Learn Wise. Check your connection and try again.";
      }
      if (code === "OTP_RESEND_COOLDOWN" || code === "OTP_HOURLY_LIMIT") {
        return err.message;
      }
      if (code === "OTP_INVALID" || code === "INVALID_OTP") {
        return "Incorrect code. Please try again.";
      }
      if (code === "OTP_EXPIRED" || code === "OTP_NOT_FOUND") {
        return "Code expired or not found. Request a new code.";
      }
      if (code === "OTP_MAX_ATTEMPTS" || code === "OTP_REUSED") {
        return err.message;
      }
      if (code === "EMAIL_NOT_VERIFIED") {
        return "Verification expired. Request and verify a new code.";
      }
      if (code === "VALIDATION_FAILED" || err.message === "Validation failed") {
        return (
          formatValidationDetails(err.details) ??
          "Some fields were rejected by the server. Check name, birth year, grade, and Student ID."
        );
      }
      if (err.status === 401) {
        return "Your Admin session expired. Sign in again as Admin.";
      }
      if (err.status === 403) {
        return "You are not allowed to create student accounts.";
      }
      if (code === "STUDENT_ID_TAKEN" || /already in use/i.test(err.message)) {
        return suggestions.length
          ? `That Student ID is already in use. Try ${suggestions.join(", ")}.`
          : "That Student ID is already in use. Choose another.";
      }
      if (code === "GRADE_LOCKED" || code === "GRADE_COMING_SOON") {
        return "Only Grade 1 is available for this flow.";
      }
      if (err.status >= 500) {
        return "Our servers are taking a short break. Please try again shortly.";
      }
      if (/password|temporary|credential/i.test(err.message)) {
        return "Could not complete the request. Please try again.";
      }
      return err.message || "Something went wrong.";
    }
    return "Something went wrong. Please try again.";
  }

  const clearHandoverSecrets = useCallback(() => {
    setIssued(null);
    setCreatedChild(null);
    setHandoverAcknowledged(false);
    setRenameDraft("");
  }, []);

  const loadGrade1 = useCallback(async () => {
    try {
      const grades = await apiRequest<LearnWiseGrade[]>("/children/learn-wise-grades");
      const g1 = (Array.isArray(grades) ? grades : []).find(
        (g) => g.levelCode === "LEVEL_1" && g.available
      );
      if (!g1?.levelId) {
        setGrade1(null);
        setError("Grade 1 (LEVEL_1) is not available on the server.");
      } else {
        setGrade1(g1);
      }
    } catch (e) {
      setError(mapError(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      const user = await getUser<{ role: string }>();
      if (cancelled) return;
      if (!token || !user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
        setAllowed(false);
        setReady(true);
        return;
      }
      setAllowed(true);
      await loadGrade1();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      setIssued(null);
      setCreatedChild(null);
      setVerificationToken(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function preferredIdOrError(): string | null | undefined {
    const raw = preferredStudentLoginId.trim();
    if (!raw) return undefined;
    const id = raw.toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{3,12}$/.test(id)) {
      setError("Student ID must be 3–12 letters or numbers (A–Z, 0–9).");
      return null;
    }
    return id;
  }

  async function suggestDefaultId() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ studentLoginId: string }>(
        "/student/auth/admin/suggest-student-login-id",
        { method: "POST", body: {} }
      );
      if (data?.studentLoginId) {
        setPreferredStudentLoginId(data.studentLoginId);
        setInfo("Generated a unique Student ID. You can edit it before creating.");
      }
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onSendOtp() {
    if (loading) return;
    const email = sharedEmail.trim().toLowerCase();
    if (email !== SHARED_MAILBOX) {
      setError(`Enter the shared verification email: ${SHARED_MAILBOX}`);
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<{
        message: string;
        destinationHint: string;
        expiresInSec: number;
        resendInSec: number;
      }>("/student/auth/admin/shared-email-otp/send", {
        method: "POST",
        body: {},
      });
      setDestinationHint(data.destinationHint ?? null);
      setOtp("");
      setVerificationToken(null);
      setStep("otp");
      setInfo(
        data.message ||
          `Verification code sent${data.destinationHint ? ` to ${data.destinationHint}` : ""}.`
      );
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    if (loading) return;
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<{
        verified: boolean;
        verificationToken: string;
        expiresInSec: number;
      }>("/student/auth/admin/shared-email-otp/verify", {
        method: "POST",
        body: { otp: code },
      });
      if (!data?.verificationToken) {
        setError("Verification failed. Request a new code.");
        return;
      }
      setVerificationToken(data.verificationToken);
      setOtp("");
      setStep("details");
      setInfo("Email verified. Enter student details.");
      if (!preferredStudentLoginId.trim()) {
        await suggestDefaultIdQuiet();
      }
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function suggestDefaultIdQuiet() {
    try {
      const data = await apiRequest<{ studentLoginId: string }>(
        "/student/auth/admin/suggest-student-login-id",
        { method: "POST", body: {} }
      );
      if (data?.studentLoginId) setPreferredStudentLoginId(data.studentLoginId);
    } catch {
      // Optional preview — create will still allocate if blank.
    }
  }

  function validateDetails(): boolean {
    setError(null);
    const name = displayName.trim();
    if (name.length < 1 || name.length > 50) {
      setError("Enter a student display name (1–50 characters).");
      return false;
    }
    const year = Number(birthYear);
    if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear()) {
      setError("Enter a valid birth year.");
      return false;
    }
    if (!grade1?.levelId) {
      setError("Grade 1 is not available.");
      return false;
    }
    if (!verificationToken) {
      setError("Verify the Admin email OTP first.");
      return false;
    }
    if (preferredIdOrError() === null) return false;
    return true;
  }

  async function onCreate() {
    if (loading) return;
    if (!validateDetails() || !grade1 || !verificationToken) return;

    const preferred = preferredIdOrError();
    if (preferred === null) return;

    setLoading(true);
    setError(null);
    setInfo(null);
    setIdSuggestions([]);
    try {
      const data = await apiRequest<CreateResponse>(
        "/student/auth/admin/shared-email-otp/children",
        {
          method: "POST",
          body: {
            verificationToken,
            displayName: displayName.trim(),
            birthYear: Number(birthYear),
            levelId: grade1.levelId,
            level: "LEVEL_1",
            ...(preferred !== undefined ? { preferredStudentLoginId: preferred } : {}),
          },
        }
      );

      if (!data?.credentials?.studentLoginId) {
        setError("Child was created but Student ID was not issued. Contact support.");
        clearHandoverSecrets();
        return;
      }

      setCreatedChild(data.child);
      setIssued({
        credentialId: data.credentials.credentialId,
        childId: data.credentials.childId || data.child.id,
        studentLoginId: data.credentials.studentLoginId,
        temporaryPassword: data.credentials.temporaryPassword,
        mustChangePassword: data.credentials.mustChangePassword ?? true,
      });
      setRenameDraft(data.credentials.studentLoginId);
      setVerificationToken(null);
      setHandoverAcknowledged(false);
      setStep("handover");
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onRenameStudentId() {
    if (!issued || renaming) return;
    const next = renameDraft.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{3,12}$/.test(next)) {
      setError("Student ID must be 3–12 letters or numbers (A–Z, 0–9).");
      return;
    }
    if (next === issued.studentLoginId) {
      setInfo("Student ID is unchanged.");
      return;
    }
    setRenaming(true);
    setError(null);
    setIdSuggestions([]);
    try {
      const data = await apiRequest<{
        childId: string;
        studentLoginId: string;
        previousStudentLoginId: string;
      }>(`/student/auth/admin/children/${issued.childId}/student-login-id`, {
        method: "PATCH",
        body: { studentLoginId: next },
      });
      setIssued({ ...issued, studentLoginId: data.studentLoginId });
      setRenameDraft(data.studentLoginId);
      setInfo(`Student ID updated to ${data.studentLoginId}.`);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setRenaming(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setInfo(`${label} copied.`);
        return;
      }
      const { default: Clipboard } = await import("expo-clipboard");
      await Clipboard.setStringAsync(value);
      setInfo(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label}.`);
    }
  }

  async function shareCredentials() {
    if (!issued) return;
    const { Share } = await import("react-native");
    const lines = [
      "LEARN WISE — Grade 1 student login",
      `Student ID: ${issued.studentLoginId}`,
      issued.temporaryPassword
        ? `Temporary password: ${issued.temporaryPassword}`
        : "Temporary password: (shown only once — ask Admin if missing)",
      "Change the password on first login.",
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      setError("Could not open share sheet.");
    }
  }

  function resetForAnother() {
    clearHandoverSecrets();
    setDisplayName("");
    setBirthYear("2018");
    setPreferredStudentLoginId("");
    setOtp("");
    setVerificationToken(null);
    setIdSuggestions([]);
    setError(null);
    setInfo(null);
    setStep("email");
  }

  if (!ready) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.purpleDeep ?? "#3D2E8A"} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Admin only</Text>
        <Text style={styles.sub}>
          Only Admin / Super Admin can create Grade 1 Student ID accounts.
        </Text>
        <Pressable
          style={styles.cta}
          onPress={() => router.replace(routeForRole("PARENT") as never)}
        >
          <Text style={styles.ctaText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <KeyboardAwareScroll contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Admin</Text>
        </Pressable>
        <Text style={styles.brand}>Learn Wise</Text>
        <Text style={styles.title}>Create Student (Grade 1)</Text>
        <Text style={styles.sub}>
          Verify the Admin mailbox with OTP, then issue a Student ID and temporary password.
          Grades 2–4 stay locked. No Parent picker — accounts use the system sponsor without a
          learning seat.
        </Text>

        {step === "email" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Shared verification email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={sharedEmail}
              onChangeText={(v) => {
                setSharedEmail(v);
                setError(null);
              }}
              editable={!loading}
              accessibilityLabel="Shared verification email"
            />
            <Text style={styles.hint}>
              Enter {SHARED_MAILBOX}. A real OTP is sent to this mailbox — codes are never shown in
              the app or API.
            </Text>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}
            <Pressable
              style={[styles.cta, loading && styles.ctaDisabled]}
              disabled={loading}
              onPress={() => void onSendOtp()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Send verification code</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {step === "otp" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Enter 6-digit code</Text>
            {destinationHint ? (
              <Text style={styles.hint}>Sent to {destinationHint}</Text>
            ) : null}
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(v) => {
                setOtp(v.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              editable={!loading}
              accessibilityLabel="Verification code"
            />
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}
            <Pressable
              style={[styles.cta, loading && styles.ctaDisabled]}
              disabled={loading}
              onPress={() => void onVerifyOtp()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Verify code</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={loading}
              onPress={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
            >
              <Text style={styles.secondaryText}>Back / resend</Text>
            </Pressable>
          </View>
        ) : null}

        {step === "details" || step === "confirm" ? (
          <View style={styles.card}>
            <Text style={styles.label}>Student display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={(v) => {
                setDisplayName(v);
                setError(null);
              }}
              editable={!loading}
              maxLength={50}
              accessibilityLabel="Student display name"
            />
            <Text style={styles.label}>Birth year</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={birthYear}
              onChangeText={(v) => {
                setBirthYear(v.replace(/\D/g, "").slice(0, 4));
                setError(null);
              }}
              editable={!loading}
              accessibilityLabel="Birth year"
            />
            <Text style={styles.label}>Student ID (editable)</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              value={preferredStudentLoginId}
              onChangeText={(v) => {
                setPreferredStudentLoginId(v);
                setIdSuggestions([]);
                setError(null);
              }}
              editable={!loading}
              placeholder="e.g. ARJUN or RIYA"
              placeholderTextColor="#9AA0B5"
              accessibilityLabel="Preferred Student ID"
            />
            <Text style={styles.hint}>
              3–12 letters or numbers. Leave blank to auto-generate, or tap Generate.
            </Text>
            <Pressable
              style={styles.secondary}
              disabled={loading}
              onPress={() => void suggestDefaultId()}
            >
              <Text style={styles.secondaryText}>Generate Student ID</Text>
            </Pressable>
            {idSuggestions.length ? (
              <View style={styles.suggestRow}>
                {idSuggestions.map((s) => (
                  <Pressable
                    key={s}
                    style={styles.suggestChip}
                    onPress={() => {
                      setPreferredStudentLoginId(s);
                      setIdSuggestions([]);
                      setError(null);
                    }}
                  >
                    <Text style={styles.suggestText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.meta}>Grade: Grade 1 (LEVEL_1) · Seat: not granted</Text>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}
            {step === "details" ? (
              <Pressable
                style={[styles.cta, loading && styles.ctaDisabled]}
                disabled={loading}
                onPress={() => {
                  if (validateDetails()) setStep("confirm");
                }}
              >
                <Text style={styles.ctaText}>Review</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.confirmLine}>Name: {displayName.trim()}</Text>
                <Text style={styles.confirmLine}>Birth year: {birthYear}</Text>
                <Text style={styles.confirmLine}>
                  Student ID:{" "}
                  {preferredStudentLoginId.trim()
                    ? preferredStudentLoginId.trim().toUpperCase()
                    : "(auto-generate)"}
                </Text>
                <Pressable
                  style={[styles.cta, loading && styles.ctaDisabled]}
                  disabled={loading}
                  onPress={() => void onCreate()}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.ctaText}>Create student account</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.secondary}
                  disabled={loading}
                  onPress={() => setStep("details")}
                >
                  <Text style={styles.secondaryText}>Edit details</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {step === "handover" && issued ? (
          <View style={styles.card}>
            <Text style={styles.handoverTitle}>Handover credentials</Text>
            <Text style={styles.hint}>
              Show once securely. Temporary password is not stored in plain text after this screen.
            </Text>
            <Text style={styles.resultLine}>Student ID: {issued.studentLoginId}</Text>
            {issued.temporaryPassword ? (
              <Text style={styles.resultLine}>
                Temporary password: {issued.temporaryPassword}
              </Text>
            ) : (
              <Text style={styles.hint}>Temporary password was already shown once.</Text>
            )}
            {createdChild ? (
              <Text style={styles.meta}>
                Seat: {createdChild.hasLearningSeat ? "yes" : "no"} ·{" "}
                {createdChild.subscriptionStatus ?? "UNPAID"}
              </Text>
            ) : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Edit Student ID</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              value={renameDraft}
              onChangeText={setRenameDraft}
              editable={!renaming}
              accessibilityLabel="Rename Student ID"
            />
            <Pressable
              style={styles.secondary}
              disabled={renaming}
              onPress={() => void onRenameStudentId()}
            >
              {renaming ? (
                <ActivityIndicator color={colors.purpleDeep ?? "#3D2E8A"} />
              ) : (
                <Text style={styles.secondaryText}>Save Student ID</Text>
              )}
            </Pressable>

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <View style={styles.row}>
              <Pressable
                style={styles.secondary}
                onPress={() => void copyText("Student ID", issued.studentLoginId)}
              >
                <Text style={styles.secondaryText}>Copy Student ID</Text>
              </Pressable>
              {issued.temporaryPassword ? (
                <Pressable
                  style={styles.secondary}
                  onPress={() =>
                    void copyText("Temporary password", issued.temporaryPassword!)
                  }
                >
                  <Text style={styles.secondaryText}>Copy password</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.secondary} onPress={() => void shareCredentials()}>
              <Text style={styles.secondaryText}>Share securely</Text>
            </Pressable>

            <Pressable
              style={styles.checkRow}
              onPress={() => setHandoverAcknowledged((v) => !v)}
            >
              <Text style={styles.checkBox}>{handoverAcknowledged ? "☑" : "☐"}</Text>
              <Text style={styles.checkLabel}>
                I have recorded these credentials for secure handover.
              </Text>
            </Pressable>

            <Pressable
              style={[styles.cta, !handoverAcknowledged && styles.ctaDisabled]}
              disabled={!handoverAcknowledged}
              onPress={() => {
                clearHandoverSecrets();
                resetForAnother();
              }}
            >
              <Text style={styles.ctaText}>Done — create another</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                clearHandoverSecrets();
                router.replace("/admin" as never);
              }}
            >
              <Text style={styles.secondaryText}>Back to Admin</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3FF" },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 22, paddingBottom: 40 },
  back: { color: colors.purpleDeep ?? "#3D2E8A", fontWeight: "600", marginBottom: 8 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.purpleDeep ?? "#3D2E8A",
    textAlign: "center",
  },
  title: {
    marginTop: 12,
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
  hint: { fontSize: 12, color: "#6B7280", marginBottom: 12, lineHeight: 18 },
  meta: { fontSize: 12, color: "#6B7280", marginBottom: 10 },
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
  error: { color: "#B91C1C", marginBottom: 10, fontSize: 13 },
  info: { color: "#166534", marginBottom: 10, fontSize: 13 },
  cta: {
    backgroundColor: colors.purpleDeep ?? "#3D2E8A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#FAF5FF",
  },
  secondaryText: { color: colors.purpleDeep ?? "#3D2E8A", fontWeight: "600" },
  confirmLine: { fontSize: 14, color: "#374151", marginBottom: 6 },
  handoverTitle: { fontSize: 18, fontWeight: "700", color: "#2D2A4A", marginBottom: 8 },
  resultLine: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 6 },
  row: { gap: 0 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  suggestChip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestText: { color: colors.purpleDeep ?? "#3D2E8A", fontWeight: "600", fontSize: 13 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 14, gap: 8 },
  checkBox: { fontSize: 18, color: colors.purpleDeep ?? "#3D2E8A" },
  checkLabel: { flex: 1, fontSize: 13, color: "#4B5563", lineHeight: 18 },
});
