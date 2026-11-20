import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

type Lookup = {
  childId: string;
  studentLoginId: string;
  displayName: string;
  level?: string | null;
  hasLearningSeat?: boolean;
  mustChangePassword?: boolean;
};

/**
 * Admin student-management: rename Student ID without resetting password,
 * progress, ownership, or subscription/seat status.
 */
export default function AdminEditStudentIdScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [found, setFound] = useState<Lookup | null>(null);
  const [newId, setNewId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const user = await getUser<{ role: string }>();
      if (!token || !user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
        setAllowed(false);
      } else {
        setAllowed(true);
      }
      setReady(true);
    })();
  }, []);

  function mapError(err: unknown): string {
    if (err instanceof ApiError) {
      const details = err.details as { suggestions?: string[] } | undefined;
      if (Array.isArray(details?.suggestions)) setSuggestions(details.suggestions);
      return err.message;
    }
    return "Request failed.";
  }

  async function onLookup() {
    if (loading) return;
    const id = lookupId.trim();
    if (!id) {
      setError("Enter the current Student ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    setFound(null);
    setSuggestions([]);
    try {
      const data = await apiRequest<Lookup>(
        `/student/auth/admin/by-student-login-id/${encodeURIComponent(id)}`
      );
      setFound(data);
      setNewId(data.studentLoginId);
      setInfo(`Found ${data.displayName}.`);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!found || loading) return;
    const next = newId.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{3,12}$/.test(next)) {
      setError("Student ID must be 3–12 letters or numbers (A–Z, 0–9).");
      return;
    }
    if (next === found.studentLoginId) {
      setInfo("Student ID is unchanged.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const data = await apiRequest<{
        studentLoginId: string;
        previousStudentLoginId: string;
      }>(`/student/auth/admin/children/${found.childId}/student-login-id`, {
        method: "PATCH",
        body: { studentLoginId: next },
      });
      setFound({ ...found, studentLoginId: data.studentLoginId });
      setLookupId(data.studentLoginId);
      setNewId(data.studentLoginId);
      setInfo(
        `Student ID updated from ${data.previousStudentLoginId} to ${data.studentLoginId}. Password and progress are unchanged.`
      );
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
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
        <Text style={styles.title}>Edit Student ID</Text>
        <Text style={styles.sub}>
          Change the login ID for an existing student. Does not reset password, progress,
          ownership, or seats.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Current Student ID</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            value={lookupId}
            onChangeText={(v) => {
              setLookupId(v);
              setError(null);
            }}
            editable={!loading}
          />
          <Pressable
            style={[styles.cta, loading && styles.ctaDisabled]}
            disabled={loading}
            onPress={() => void onLookup()}
          >
            {loading && !found ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Look up</Text>
            )}
          </Pressable>

          {found ? (
            <>
              <Text style={styles.meta}>
                {found.displayName} · seat {found.hasLearningSeat ? "yes" : "no"}
              </Text>
              <Text style={styles.label}>New Student ID</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                value={newId}
                onChangeText={(v) => {
                  setNewId(v);
                  setSuggestions([]);
                  setError(null);
                }}
                editable={!loading}
              />
              {suggestions.length ? (
                <View style={styles.suggestRow}>
                  {suggestions.map((s) => (
                    <Pressable
                      key={s}
                      style={styles.suggestChip}
                      onPress={() => {
                        setNewId(s);
                        setSuggestions([]);
                      }}
                    >
                      <Text style={styles.suggestText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Pressable
                style={[styles.cta, loading && styles.ctaDisabled]}
                disabled={loading}
                onPress={() => void onSave()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaText}>Save Student ID</Text>
                )}
              </Pressable>
            </>
          ) : null}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}
        </View>
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
  },
  label: { fontSize: 13, fontWeight: "600", color: "#4B5563", marginBottom: 6 },
  meta: { fontSize: 13, color: "#6B7280", marginVertical: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: "#FAFAFC",
  },
  error: { color: "#B91C1C", marginTop: 10, fontSize: 13 },
  info: { color: "#166534", marginTop: 10, fontSize: 13 },
  cta: {
    backgroundColor: colors.purpleDeep ?? "#3D2E8A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  suggestChip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestText: { color: colors.purpleDeep ?? "#3D2E8A", fontWeight: "600", fontSize: 13 },
});
