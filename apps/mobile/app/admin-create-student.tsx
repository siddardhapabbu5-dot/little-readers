import { useEffect, useMemo, useState } from "react";
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
import { apiRequest } from "../services/api";
import { friendlyAuthError, routeForRole } from "../services/auth-errors";
import { getToken, getUser } from "../services/secure";
import { colors, radii } from "../theme";

type SchoolGrade = {
  id: string;
  code: string;
  label: string;
  gradeNumber: number | null;
  isActive: boolean;
  isPublished: boolean;
};

type LevelRow = {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  isPublished: boolean;
  schoolGrades?: SchoolGrade[];
};

type Issued = {
  studentLoginId: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  childId: string;
};

/**
 * Authenticated Admin Dashboard flow: create Student ID accounts directly
 * (no Sponsor Parent picker). Subscription stays UNPAID until entitlement.
 */
export default function AdminCreateStudentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("2018");
  const [preferredStudentLoginId, setPreferredStudentLoginId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"UNPAID" | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const user = await getUser<{ role: string }>();
      if (!token || !user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
        setAllowed(false);
        setReady(true);
        return;
      }
      setAllowed(true);
      try {
        const levelData = await apiRequest<LevelRow[]>(
          "/admin/academic/levels?includeInactive=0"
        );
        const activeLevels = (Array.isArray(levelData) ? levelData : []).filter(
          (l) => l.isActive !== false
        );
        setLevels(activeLevels);
        if (activeLevels[0]) setLevelId(activeLevels[0].id);
      } catch (e) {
        setError(friendlyAuthError(e));
      }
      setReady(true);
    })();
  }, []);

  const gradesForLevel = useMemo(() => {
    const level = levels.find((l) => l.id === levelId);
    const grades = level?.schoolGrades ?? [];
    return grades.filter((g) => g.isActive !== false && g.isPublished !== false);
  }, [levels, levelId]);

  useEffect(() => {
    if (!gradesForLevel.some((g) => g.id === gradeId)) {
      setGradeId(gradesForLevel[0]?.id ?? "");
    }
  }, [gradesForLevel, gradeId]);

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

  async function shareCredentials(row: Issued) {
    const { Share } = await import("react-native");
    const lines = [
      "LEARN WISE student login",
      `Student ID: ${row.studentLoginId}`,
      row.temporaryPassword ? `Temporary password: ${row.temporaryPassword}` : null,
      "Subscription: UNPAID",
      "Change password on first login if required.",
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join("\n"), title: "Student credentials" });
      setInfo("Credentials share sheet opened.");
    } catch {
      setError("Could not open share sheet.");
    }
  }

  function preferredIdOrError(): string | null | undefined {
    const raw = preferredStudentLoginId.trim();
    if (!raw) return undefined;
    const id = raw.toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{4,12}$/.test(id)) {
      setError("Student ID must be 4–12 letters or numbers (A–Z, 0–9).");
      return null;
    }
    return id;
  }

  async function onRenameStudentId() {
    if (!issued || renaming || loading) return;
    setError(null);
    setInfo(null);
    const next = renameDraft.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{4,12}$/.test(next)) {
      setError("Student ID must be 4–12 letters or numbers (A–Z, 0–9).");
      return;
    }
    if (next === issued.studentLoginId) {
      setInfo("Student ID is unchanged.");
      return;
    }
    setRenaming(true);
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
      setError(friendlyAuthError(e));
    } finally {
      setRenaming(false);
    }
  }

  async function onCreateDirectStudent() {
    if (loading) return;
    setError(null);
    setInfo(null);
    setIssued(null);
    setSubscriptionStatus(null);
    const name = displayName.trim();
    const year = Number(birthYear);
    if (name.length < 1) {
      setError("Enter the student’s display name.");
      return;
    }
    if (!levelId) {
      setError("Select a Level.");
      return;
    }
    if (!gradeId) {
      setError("Select a Grade.");
      return;
    }
    if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear()) {
      setError("Enter a valid birth year.");
      return;
    }
    const preferred = preferredIdOrError();
    if (preferred === null) return;
    setLoading(true);
    try {
      const data = await apiRequest<{
        child: { id: string; hasLearningSeat?: boolean; subscriptionStatus?: string };
        credentials: Issued | null;
      }>("/student/auth/admin/direct-children", {
        method: "POST",
        body: {
          displayName: name,
          birthYear: year,
          levelId,
          gradeId,
          ...(preferred !== undefined ? { preferredStudentLoginId: preferred } : {}),
        },
      });
      if (!data.credentials?.studentLoginId) {
        setError("Child created but Student ID was not issued.");
        return;
      }
      setIssued({
        studentLoginId: data.credentials.studentLoginId,
        temporaryPassword: data.credentials.temporaryPassword,
        mustChangePassword: data.credentials.mustChangePassword,
        childId: data.child.id,
      });
      setRenameDraft(data.credentials.studentLoginId);
      setSubscriptionStatus("UNPAID");
      setInfo("Student account created. No subscription was activated.");
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingHorizontal: 22 }]}>
        <Text style={styles.title}>Create Student Account</Text>
        <Text style={styles.sub}>
          Only Admin / Super Admin can issue a Student ID and password from the Admin Dashboard.
        </Text>
        <Pressable style={styles.cta} onPress={() => router.replace("/login" as never)}>
          <Text style={styles.ctaText}>Go to Admin login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <KeyboardAwareScroll contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Create Student Account</Text>
        <Text style={styles.sub}>
          Create a Student ID + temporary password directly. No parent registration or selection
          required. Subscription stays unpaid until purchase or Admin entitlement.
        </Text>

        <View style={styles.block}>
          <Text style={styles.label}>Student name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Student name"
            placeholderTextColor="#9AA0B5"
          />
          <Text style={styles.label}>Birth year</Text>
          <TextInput
            style={styles.input}
            value={birthYear}
            onChangeText={setBirthYear}
            keyboardType="number-pad"
            placeholder="Birth year"
            placeholderTextColor="#9AA0B5"
          />
          <Text style={styles.label}>Student ID (optional)</Text>
          <TextInput
            style={styles.input}
            value={preferredStudentLoginId}
            onChangeText={setPreferredStudentLoginId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. SAM01 — leave blank to auto-generate"
            placeholderTextColor="#9AA0B5"
            maxLength={12}
          />
          <Text style={styles.hint}>
            4–12 letters or numbers. Leave blank for an automatic unique ID.
          </Text>

          <Text style={styles.label}>Level</Text>
          <View style={styles.row}>
            {levels.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => setLevelId(l.id)}
                style={[styles.chip, levelId === l.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, levelId === l.id && styles.chipTextOn]}>
                  {l.label || l.code}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Grade</Text>
          <View style={styles.row}>
            {gradesForLevel.length === 0 ? (
              <Text style={styles.warn}>No grades linked to this level.</Text>
            ) : (
              gradesForLevel.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setGradeId(g.id)}
                  style={[styles.chip, gradeId === g.id && styles.chipOn]}
                >
                  <Text style={[styles.chipText, gradeId === g.id && styles.chipTextOn]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <Pressable
            style={[styles.cta, (loading || !gradeId) && styles.disabled]}
            disabled={loading || !gradeId}
            onPress={() => void onCreateDirectStudent()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Create Student Account</Text>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.ok}>{info}</Text> : null}

        {issued ? (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>Student credentials issued (view once)</Text>
            <Text style={styles.resultLine}>Student ID: {issued.studentLoginId}</Text>
            {issued.temporaryPassword ? (
              <Text style={styles.resultLine}>
                Temporary password: {issued.temporaryPassword}
              </Text>
            ) : (
              <Text style={styles.resultLine}>Password set (not shown).</Text>
            )}
            <View style={styles.unpaidBadge}>
              <Text style={styles.unpaidText}>
                Subscription: {subscriptionStatus ?? "UNPAID"}
              </Text>
            </View>
            <Text style={styles.label}>Rename Student ID</Text>
            <TextInput
              style={styles.input}
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              placeholder="New Student ID"
              placeholderTextColor="#9AA0B5"
            />
            <Pressable
              style={[styles.secondary, (renaming || loading) && styles.disabled]}
              disabled={renaming || loading}
              onPress={() => void onRenameStudentId()}
            >
              {renaming ? (
                <ActivityIndicator color={colors.purpleDeep ?? "#3D2E8A"} />
              ) : (
                <Text style={styles.secondaryText}>Save new Student ID</Text>
              )}
            </Pressable>
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
            <Pressable style={styles.cta} onPress={() => void shareCredentials(issued)}>
              <Text style={styles.ctaText}>Share credentials</Text>
            </Pressable>
            <Text style={styles.warn}>
              Share securely with the student. Change password on first login if required. No
              subscription was activated.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.replace(routeForRole("ADMIN") as never)}
          style={styles.link}
        >
          <Text style={styles.linkText}>Back to Admin Dashboard</Text>
        </Pressable>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3FF" },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 22, paddingBottom: 40, gap: 10 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2A2160",
    marginBottom: 4,
  },
  sub: { fontSize: 14, color: "#5C567A", lineHeight: 20, marginBottom: 8 },
  block: { gap: 8, marginTop: 4 },
  label: { fontSize: 13, fontWeight: "700", color: "#3D2E8A", marginTop: 4 },
  hint: { fontSize: 12, color: "#7A7496", marginBottom: 2 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9D4F0",
    borderRadius: radii.md ?? 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1F1A3D",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipOn: { backgroundColor: "#5B4BDB" },
  chipText: { color: "#3D2E8A", fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  cta: {
    marginTop: 10,
    backgroundColor: "#5B4BDB",
    borderRadius: radii.md ?? 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9C2EF",
    borderRadius: radii.md ?? 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 6,
  },
  secondaryText: { color: "#3D2E8A", fontWeight: "700" },
  disabled: { opacity: 0.55 },
  error: { color: "#B42318", fontWeight: "600" },
  ok: { color: "#027A48", fontWeight: "600" },
  warn: { color: "#9A6700", fontSize: 12, lineHeight: 18 },
  result: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: radii.md ?? 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D9D4F0",
    gap: 6,
  },
  resultTitle: { fontWeight: "800", color: "#2A2160", fontSize: 15 },
  resultLine: { fontSize: 15, color: "#1F1A3D", fontWeight: "600" },
  unpaidBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF4E5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 4,
  },
  unpaidText: { color: "#9A6700", fontWeight: "800", fontSize: 12 },
  link: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  linkText: { color: "#5B4BDB", fontWeight: "700" },
});
