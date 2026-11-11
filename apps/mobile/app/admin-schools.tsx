import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, KeyboardScroll, PrimaryButton, SoftButton, LoadingSlot } from "../components/ui";
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
  const [search, setSearch] = useState("");
  const [classrooms, setClassrooms] = useState<
    Array<{ id: string; name: string; studentCount?: number }>
  >([]);
  const [teachers, setTeachers] = useState<
    Array<{ userId?: string; id?: string; name?: string; email?: string; user?: { id: string; name: string; email: string } }>
  >([]);
  const [assignClassroomId, setAssignClassroomId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [enrollChildId, setEnrollChildId] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const data = await apiRequest<SchoolRow[]>(
      `/admin/schools${params.toString() ? `?${params}` : ""}`
    );
    setRows(data);
  }, [search]);

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
      await openManage(selected);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Classroom create failed");
    }
  }

  async function openManage(s: SchoolRow) {
    setSelected(s);
    setMessage(null);
    setError(null);
    try {
      const [t, c] = await Promise.all([
        apiRequest<typeof teachers>(`/admin/schools/${s.id}/teachers`),
        apiRequest<typeof classrooms>(`/admin/schools/${s.id}/classrooms`),
      ]);
      setTeachers(t);
      setClassrooms(c);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load school detail");
    }
  }

  function deactivateSchool(s: SchoolRow) {
    const run = () => {
      void (async () => {
        setError(null);
        try {
          await apiRequest(`/admin/schools/${s.id}/deactivate`, {
            method: "POST",
          });
          setMessage("School deactivated (records kept)");
          await load();
          setSelected(null);
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Deactivate failed");
        }
      })();
    };
    if (Platform.OS === "web") {
      if (
        globalThis.confirm?.(
          `Deactivate school "${s.name}"? Records and learning history stay.`
        )
      ) {
        run();
      }
      return;
    }
    Alert.alert(
      "Deactivate school?",
      `${s.name}. Classrooms and student history are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: run },
      ]
    );
  }

  async function activateSchool(s: SchoolRow) {
    try {
      await apiRequest(`/admin/schools/${s.id}/activate`, { method: "POST" });
      setMessage("School activated");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activate failed");
    }
  }

  async function assignTeacher() {
    if (!selected || !assignClassroomId || !assignTeacherId) return;
    try {
      await apiRequest(`/admin/schools/classrooms/${assignClassroomId}/teachers`, {
        method: "POST",
        body: JSON.stringify({ teacherUserId: assignTeacherId }),
      });
      setMessage("Teacher assigned to classroom");
      await openManage(selected);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Assign failed");
    }
  }

  async function enrollChild() {
    if (!selected || !assignClassroomId || !enrollChildId.trim()) return;
    try {
      await apiRequest(`/admin/schools/classrooms/${assignClassroomId}/students`, {
        method: "POST",
        body: JSON.stringify({ childId: enrollChildId.trim() }),
      });
      setMessage("Student enrolled");
      setEnrollChildId("");
      await openManage(selected);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enroll failed");
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.schools}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Schools</Text>
          <Text style={styles.sub}>
            Manage schools, teachers and classrooms (existing Admin APIs)
          </Text>
        </View>
        <LoadingSlot active={loading} color={adminColors.primary} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <KeyboardScroll contentContainerStyle={{ gap: 12, paddingBottom: 24, paddingHorizontal: 16 }}>
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
            <TextInput
              style={styles.input}
              placeholder="Search schools"
              value={search}
              onChangeText={setSearch}
            />
            <SoftButton label="Search" onPress={() => void load()} />
            {rows.map((s) => (
              <View key={s.id} style={styles.rowBlock}>
                <Text style={styles.rowTitle}>
                  {s.name} {s.isActive ? "" : "(inactive)"}
                </Text>
                <Text style={styles.row}>
                  {s.teacherCount} teachers · {s.classroomCount} classrooms ·{" "}
                  {s.studentCount} students
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <SoftButton label="Manage" onPress={() => void openManage(s)} />
                  {s.isActive ? (
                    <SoftButton
                      label="Deactivate"
                      onPress={() => deactivateSchool(s)}
                    />
                  ) : (
                    <SoftButton
                      label="Activate"
                      onPress={() => void activateSchool(s)}
                    />
                  )}
                </View>
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

              <Text style={styles.section}>Classrooms</Text>
              {classrooms.map((c) => (
                <SoftButton
                  key={c.id}
                  label={`${c.name}${c.studentCount != null ? ` (${c.studentCount})` : ""}`}
                  active={assignClassroomId === c.id}
                  onPress={() => setAssignClassroomId(c.id)}
                />
              ))}

              <Text style={styles.section}>Assign teacher → classroom</Text>
              {teachers.map((t) => {
                const id = t.userId ?? t.user?.id ?? t.id ?? "";
                const label = t.user?.name ?? t.name ?? t.user?.email ?? t.email ?? id;
                return (
                  <SoftButton
                    key={id}
                    label={label}
                    active={assignTeacherId === id}
                    onPress={() => setAssignTeacherId(id)}
                  />
                );
              })}
              <PrimaryButton
                label="Assign selected teacher"
                onPress={() => void assignTeacher()}
                disabled={!assignClassroomId || !assignTeacherId}
              />

              <Text style={styles.section}>Enroll student (child ID)</Text>
              <TextInput
                style={styles.input}
                placeholder="Child profile ID"
                value={enrollChildId}
                onChangeText={setEnrollChildId}
                autoCapitalize="none"
              />
              <PrimaryButton
                label="Enroll in selected classroom"
                onPress={() => void enrollChild()}
                disabled={!assignClassroomId || !enrollChildId.trim()}
              />
            </Card>
          ) : null}
        </KeyboardScroll>
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
