import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
import { colors } from "../theme";

type ParentRow = { id: string; email: string; childCount: number; subscription: { plan: string; status: string } | null };
type LevelRow = { id: string; label: string; code: string; wordCount?: number };
type ImportRow = { id: string; status?: string; createdAt?: string; originalName?: string; fileName?: string };
type SubRow = { id: string; plan: string; status: string; user?: { email?: string; role?: string } };

/**
 * Super Admin only (AuthGate ROLE_SETS.superAdmin).
 * Uses the same Express admin read APIs as Admin, plus platform framing.
 * School registration / audit logs are not implemented on Express — documented, not invented.
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

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const me = await getUser<{ role: string }>();
          setRole(me?.role ?? null);
          const [p, lvl, imp, s] = await Promise.all([
            apiRequest<ParentRow[]>("/children/admin/parents"),
            apiRequest<LevelRow[]>("/learning/levels"),
            apiRequest<ImportRow[]>("/admin/vocabulary/imports"),
            apiRequest<SubRow[]>("/subscriptions/admin"),
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
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Super Admin access required");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  return (
    <AuthGate roles={ROLE_SETS.superAdmin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Super Admin</Title>
          <Text style={styles.note}>
            Session role: {role ?? "…"}. This screen is gated to SUPER_ADMIN only. Ordinary Admin
            and Parent accounts cannot open it via AuthGate.
          </Text>
          <ErrorText>{error}</ErrorText>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}

          <Card>
            <Text style={styles.section}>Platform snapshot</Text>
            <Text style={styles.row}>Parent accounts {parents.length}</Text>
            <Text style={styles.row}>
              Active child profiles {parents.reduce((n, p) => n + p.childCount, 0)}
            </Text>
            <Text style={styles.row}>Learning levels {levels.length}</Text>
            <Text style={styles.row}>Subscriptions {subs.length}</Text>
            <Text style={styles.row}>Vocab import batches {imports.length}</Text>
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
            {subs.slice(0, 30).map((s) => (
              <Text key={s.id} style={styles.row}>
                {s.user?.email ?? "—"} · {s.plan} · {s.status}
              </Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.section}>Vocabulary imports</Text>
            {!imports.length ? (
              <Text style={styles.row}>No imports yet.</Text>
            ) : (
              imports.map((i) => (
                <Text key={i.id} style={styles.row}>
                  {i.originalName ?? i.fileName ?? i.id} · {i.status ?? "—"}
                </Text>
              ))
            )}
          </Card>

          <Card color="#FFF7ED">
            <Text style={styles.section}>Not on Express yet</Text>
            <Text style={styles.row}>School registration / licenses</Text>
            <Text style={styles.row}>Platform audit logs</Text>
            <Text style={styles.row}>Plan configuration console</Text>
            <Text style={styles.row}>These remain Nest Phase 3 — not mocked here.</Text>
          </Card>

          <SoftButton label="Open Admin tools" onPress={() => router.push("/admin")} />
          <SoftButton
            label="Dictionary → Grades"
            onPress={() => router.push("/admin-dictionary")}
          />
          <SoftButton label="Devices" onPress={() => router.push("/devices")} />
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 36 },
  note: { color: colors.textMuted, lineHeight: 20 },
  section: { fontWeight: "800", fontSize: 16, marginBottom: 8, color: colors.text },
  row: { color: colors.textMuted, marginBottom: 4, lineHeight: 18 },
});
