import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, SoftButton } from "../components/ui";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, colors } from "../theme";

type SchoolRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  teacherCount: number;
  classroomCount: number;
  studentCount: number;
};

export default function AdminSchoolsScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<SchoolRow | null>(null);
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPassword, setTPassword] = useState("");
  const [cName, setCName] = useState("");

  const load = useCallback(async () => {
    const data = await apiRequest<SchoolRow[]>("/admin/schools");
    setRows(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load schools");
        } finally {
          setLoading(false);
        }
      })();
    }, [load])
  );

  async function createSchool() {
    setError(null);
    try {
      await apiRequest("/admin/schools", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
        }),
      });
      setMessage("School created");
      setName("");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Create failed");
    }
  }

  async function createTeacher() {
    if (!selected) return;
    setError(null);
    try {
      await apiRequest(`/admin/schools/${selected.id}/teachers`, {
        method: "POST",
        body: JSON.stringify({
          name: tName.trim(),
          email: tEmail.trim(),
          password: tPassword,
          staffRole: "TEACHER",
        }),
      });
      setMessage("Teacher created");
      setTName("");
      setTEmail("");
      setTPassword("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Teacher create failed");
    }
  }

  async function createClassroom() {
    if (!selected) return;
    setError(null);
    try {
      await apiRequest(`/admin/schools/${selected.id}/classrooms`, {
        method: "POST",
        body: JSON.stringify({ name: cName.trim() }),
      });
      setMessage("Classroom created");
      setCName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Classroom create failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Schools</Text>
          <Text style={styles.sub}>
            Manage schools, teachers and classrooms (existing Admin APIs)
          </Text>
        </View>
        {loading ? <ActivityIndicator color={adminColors.primary} /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24, paddingHorizontal: 16 }}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Create school</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Code (optional)"
              value={code}
              onChangeText={setCode}
            />
            <PrimaryButton
              label="Create"
              onPress={() => void createSchool()}
              disabled={!name.trim()}
            />
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Schools</Text>
            {rows.map((s) => (
              <View key={s.id} style={styles.rowBlock}>
                <Text style={styles.rowTitle}>
                  {s.name} {s.isActive ? "" : "(inactive)"}
                </Text>
                <Text style={styles.row}>
                  {s.teacherCount} teachers · {s.classroomCount} classrooms ·{" "}
                  {s.studentCount} students
                </Text>
                <SoftButton label="Manage" onPress={() => setSelected(s)} />
              </View>
            ))}
          </Card>

          {selected ? (
            <Card style={{ gap: 8 }} color="#FFF7ED">
              <Text style={styles.section}>Manage {selected.name}</Text>
              <TextInput
                style={styles.input}
                placeholder="Teacher name"
                value={tName}
                onChangeText={setTName}
              />
              <TextInput
                style={styles.input}
                placeholder="Teacher email"
                autoCapitalize="none"
                value={tEmail}
                onChangeText={setTEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Temp password"
                secureTextEntry
                value={tPassword}
                onChangeText={setTPassword}
              />
              <PrimaryButton
                label="Create teacher"
                onPress={() => void createTeacher()}
                disabled={!tName || !tEmail || tPassword.length < 8}
              />
              <TextInput
                style={styles.input}
                placeholder="New classroom name"
                value={cName}
                onChangeText={setCName}
              />
              <PrimaryButton
                label="Create classroom"
                onPress={() => void createClassroom()}
                disabled={!cName.trim()}
              />
            </Card>
          ) : null}
        </ScrollView>
        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background, gap: 10 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 4 },
  title: { fontSize: 24, fontWeight: "800", color: adminColors.text },
  sub: { color: adminColors.textSecondary, fontSize: 13, lineHeight: 18 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.text,
  },
  rowBlock: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontWeight: "800", color: colors.text },
  row: { color: colors.textMuted },
  ok: { color: "#047857", fontWeight: "700", paddingHorizontal: 20 },
});
