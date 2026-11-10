import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title, LoadingSlot } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
import { colors } from "../theme";

type ParentRow = {
  id: string;
  email: string;
  childCount: number;
  subscription: { plan: string; status: string } | null;
};
type LevelRow = { id: string; label: string; code: string; wordCount?: number };
type ImportRow = {
  id: string;
  status?: string;
  createdAt?: string;
  originalName?: string;
  fileName?: string;
};
type SubRow = {
  id: string;
  plan: string;
  status: string;
  user?: { email?: string; role?: string };
};
type SchoolRow = {
  id: string;
  name: string;
  isActive: boolean;
  teacherCount: number;
  classroomCount: number;
  studentCount: number;
};
type UserRow = {
  id: string;
  role: string;
  isActive: boolean;
};

/**
 * Super Admin only. Platform overview + deep links into Admin tools.
 * Ordinary Admin cannot open this screen (AuthGate).
 */
export default function SuperAdminScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const me = await getUser<{ role: string }>();
          setRole(me?.role ?? null);
          const [p, lvl, imp, s, sch, u] = await Promise.all([
            apiRequest<ParentRow[]>("/children/admin/parents"),
            apiRequest<LevelRow[]>("/learning/levels"),
            apiRequest<ImportRow[]>("/admin/vocabulary/imports"),
            apiRequest<SubRow[]>("/subscriptions/admin"),
            apiRequest<SchoolRow[]>("/admin/schools"),
            apiRequest<UserRow[]>("/admin/users").catch(() => []),
          ]);
          setParents(p);
          setLevels(lvl);
          setImports(
            imp.slice(0, 25).map((i: any) => ({
              id: i.id,
              status: i.status,
              createdAt: i.createdAt,
              originalName: i.originalFilename ?? i.originalName,
              fileName: i.fileName,
            }))
          );
          setSubs(s);
          setSchools(sch);
          setUsers(u);
        } catch (err) {
          setError(
            err instanceof ApiError ? err.message : "Super Admin access required"
          );
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const activeSchools = schools.filter((s) => s.isActive).length;
  const adminUsers = users.filter((u) => u.role === "ADMIN" || u.role === "SCHOOL_ADMIN");
  const inactiveUsers = users.filter((u) => !u.isActive).length;

  return (
    <AuthGate roles={ROLE_SETS.superAdmin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Super Admin</Title>
          <Text style={styles.note}>
            Session role: {role ?? "…"}. Gated to SUPER_ADMIN only. Ordinary Admin
            accounts cannot open this screen.
          </Text>
          <ErrorText>{error}</ErrorText>
          <LoadingSlot active={loading} />

          <Card>
            <Text style={styles.section}>Platform overview</Text>
            <Text style={styles.row}>Parent accounts {parents.length}</Text>
            <Text style={styles.row}>
              Active child profiles{" "}
              {parents.reduce((n, p) => n + p.childCount, 0)}
            </Text>
            <Text style={styles.row}>
              Schools {schools.length} · Active {activeSchools}
            </Text>
            <Text style={styles.row}>
              School students{" "}
              {schools.reduce((n, s) => n + (s.studentCount ?? 0), 0)}
            </Text>
            <Text style={styles.row}>Learning levels {levels.length}</Text>
            <Text style={styles.row}>Subscriptions {subs.length}</Text>
            <Text style={styles.row}>Vocab import batches {imports.length}</Text>
            <Text style={styles.row}>
              Admin accounts listed {adminUsers.length} · Inactive users{" "}
              {inactiveUsers}
            </Text>
          </Card>

          <Card>
            <Text style={styles.section}>Schools (organizations)</Text>
            {!schools.length ? (
              <Text style={styles.row}>No schools yet.</Text>
            ) : (
              schools.slice(0, 15).map((s) => (
                <Text key={s.id} style={styles.row}>
                  {s.name} · {s.isActive ? "active" : "inactive"} ·{" "}
                  {s.teacherCount} teachers · {s.studentCount} students
                </Text>
              ))
            )}
          </Card>

          <Card>
            <Text style={styles.section}>Levels (live word counts)</Text>
            {levels.map((l) => (
              <Text key={l.id} style={styles.row}>
                {l.label} · {l.wordCount ?? 0} words
              </Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.section}>Subscriptions</Text>
            {subs.slice(0, 20).map((s) => (
              <Text key={s.id} style={styles.row}>
                {s.user?.email ?? "—"} · {s.plan} · {s.status}
              </Text>
            ))}
          </Card>

          <SoftButton label="Manage accounts" onPress={() => router.push("/admin-users")} />
          <SoftButton label="Schools & classrooms" onPress={() => router.push("/admin-schools")} />
          <SoftButton
            label="Parent devices / sessions"
            onPress={() => router.push("/admin-parent-devices")}
          />
          <SoftButton label="Open Admin tools" onPress={() => router.push("/admin")} />
          <SoftButton
            label="Dictionary → Grades"
            onPress={() => router.push("/admin-dictionary")}
          />
          <SoftButton label="Change password" onPress={() => router.push("/change-password")} />
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 36 },
  note: { color: colors.textMuted, lineHeight: 20 },
  section: {
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
    color: colors.text,
  },
  row: { color: colors.textMuted, marginBottom: 4, lineHeight: 18 },
});
