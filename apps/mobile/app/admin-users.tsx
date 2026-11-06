import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
import { colors, radii } from "../theme";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mobileE164?: string | null;
  _count?: { children: number };
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [myRole, setMyRole] = useState<string>("ADMIN");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "SCHOOL_ADMIN">("ADMIN");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleFilter) params.set("role", roleFilter);
    const data = await apiRequest<UserRow[]>(
      `/admin/users${params.toString() ? `?${params}` : ""}`
    );
    setRows(data);
  }, [q, roleFilter]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const me = await getUser<{ role: string }>();
          setMyRole(me?.role ?? "ADMIN");
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load users");
        } finally {
          setLoading(false);
        }
      })();
    }, [load])
  );

  function confirmDeactivate(user: UserRow) {
    const run = () => {
      void (async () => {
        try {
          const data = await apiRequest<{ note?: string }>(
            `/admin/users/${user.id}/deactivate`,
            { method: "POST" }
          );
          setInfo(data.note ?? "Account deactivated. Learning history preserved.");
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Deactivate failed");
        }
      })();
    };
    if (Platform.OS === "web") {
      if (
        globalThis.confirm?.(
          `Deactivate ${user.email}? Learning history will be kept.`
        )
      ) {
        run();
      }
      return;
    }
    Alert.alert(
      "Deactivate account?",
      `${user.name} (${user.email}). Learning history is not deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: run },
      ]
    );
  }

  async function activate(user: UserRow) {
    try {
      await apiRequest(`/admin/users/${user.id}/activate`, { method: "POST" });
      setInfo("Account reactivated");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activate failed");
    }
  }

  async function createAdmin() {
    setError(null);
    try {
      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role: newRole,
        }),
      });
      setInfo("Admin account created");
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Create failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>Manage accounts</Title>
        <Text style={styles.note}>
          Soft-deactivate only — student learning history is never deleted here.
          Super Admin controls stay Super Admin–only.
        </Text>
        <ErrorText>{error}</ErrorText>
        {info ? <Text style={styles.info}>{info}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Search</Text>
            <TextInput
              style={styles.input}
              placeholder="Name, email or mobile"
              value={q}
              onChangeText={setQ}
            />
            <View style={styles.row}>
              <SoftButton
                label="All roles"
                active={!roleFilter}
                onPress={() => setRoleFilter("")}
              />
              <SoftButton
                label="Parents"
                active={roleFilter === "PARENT"}
                onPress={() => setRoleFilter("PARENT")}
              />
              <SoftButton
                label="Teachers"
                active={roleFilter === "TEACHER"}
                onPress={() => setRoleFilter("TEACHER")}
              />
              {myRole === "SUPER_ADMIN" ? (
                <SoftButton
                  label="Admins"
                  active={roleFilter === "ADMIN"}
                  onPress={() => setRoleFilter("ADMIN")}
                />
              ) : null}
            </View>
            <SoftButton label="Refresh" onPress={() => void load()} />
          </Card>

          {myRole === "SUPER_ADMIN" ? (
            <Card style={{ gap: 8 }} color="#EEF2FF">
              <Text style={styles.section}>Create admin (Super Admin)</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Temp password (8+)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <View style={styles.row}>
                <SoftButton
                  label="ADMIN"
                  active={newRole === "ADMIN"}
                  onPress={() => setNewRole("ADMIN")}
                />
                <SoftButton
                  label="SCHOOL_ADMIN"
                  active={newRole === "SCHOOL_ADMIN"}
                  onPress={() => setNewRole("SCHOOL_ADMIN")}
                />
              </View>
              <SoftButton
                label="Create"
                onPress={() => void createAdmin()}
              />
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Accounts ({rows.length})</Text>
            {rows.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <Text style={styles.userName}>
                  {u.name} · {u.role} {u.isActive ? "" : "(inactive)"}
                </Text>
                <Text style={styles.meta}>
                  {u.email}
                  {u._count?.children != null
                    ? ` · ${u._count.children} children`
                    : ""}
                </Text>
                <View style={styles.row}>
                  {u.isActive ? (
                    <SoftButton
                      label="Deactivate"
                      onPress={() => confirmDeactivate(u)}
                    />
                  ) : (
                    <SoftButton label="Activate" onPress={() => void activate(u)} />
                  )}
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 10 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  note: { color: colors.textMuted, lineHeight: 20 },
  info: { color: colors.success, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  userRow: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  userName: { fontWeight: "800", color: colors.text },
  meta: { color: colors.textMuted, fontWeight: "600" },
});
