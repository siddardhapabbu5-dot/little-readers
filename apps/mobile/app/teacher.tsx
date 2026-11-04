import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

type Classroom = {
  id: string;
  name: string;
  gradeLabel: string | null;
  schoolName: string;
  studentCount: number;
};

type ProgressStudent = {
  childId: string;
  displayName: string;
  summary: {
    lessonsCompleted: number;
    lessonsInProgress: number;
    points: number;
    stars: number;
    assignedPending: number;
  };
};

export default function TeacherScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [students, setStudents] = useState<ProgressStudent[]>([]);
  const [report, setReport] = useState<{
    studentCount: number;
    totalCompletedLessons: number;
    totalPoints: number;
  } | null>(null);

  const loadClassroom = useCallback(async (id: string) => {
    const data = await apiRequest<{
      students: ProgressStudent[];
      report: {
        studentCount: number;
        totalCompletedLessons: number;
        totalPoints: number;
      };
    }>(`/teacher/classrooms/${id}/progress`);
    setStudents(data.students);
    setReport(data.report);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const me = await apiRequest<{ classrooms: Classroom[] }>("/teacher/me");
          setClassrooms(me.classrooms);
          const first = me.classrooms[0]?.id ?? null;
          setSelectedId(first);
          if (first) await loadClassroom(first);
          else {
            setStudents([]);
            setReport(null);
          }
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load teacher data");
        } finally {
          setLoading(false);
        }
      })();
    }, [loadClassroom])
  );

  return (
    <AuthGate roles={ROLE_SETS.teacher}>
      <SafeAreaView style={styles.safe}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>Teacher</Title>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Assigned classrooms</Text>
            {!classrooms.length ? (
              <Text style={styles.item}>No classrooms assigned yet.</Text>
            ) : (
              classrooms.map((c) => (
                <SoftButton
                  key={c.id}
                  label={`${c.schoolName} · ${c.name} (${c.studentCount})`}
                  onPress={() => {
                    setSelectedId(c.id);
                    void loadClassroom(c.id).catch((e) =>
                      setError(e instanceof ApiError ? e.message : "Load failed")
                    );
                  }}
                />
              ))
            )}
          </Card>

          {selectedId && report ? (
            <Card style={{ gap: 6 }} color="#ECFDF5">
              <Text style={styles.section}>Classroom report</Text>
              <Text style={styles.item}>Students: {report.studentCount}</Text>
              <Text style={styles.item}>
                Lesson completions: {report.totalCompletedLessons}
              </Text>
              <Text style={styles.item}>Total points: {report.totalPoints}</Text>
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Students</Text>
            {!students.length ? (
              <Text style={styles.item}>No students enrolled in this classroom.</Text>
            ) : (
              students.map((s) => (
                <View key={s.childId} style={styles.student}>
                  <Text style={styles.studentName}>{s.displayName}</Text>
                  <Text style={styles.item}>
                    Completed {s.summary.lessonsCompleted} · In progress{" "}
                    {s.summary.lessonsInProgress} · {s.summary.points} pts ·{" "}
                    {s.summary.stars}★ · Pending assigned {s.summary.assignedPending}
                  </Text>
                </View>
              ))
            )}
          </Card>

          <Text style={styles.note}>
            Billing and subscription controls stay with parents and platform admins.
            Device lock applies to child accounts only.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 10 },
  section: { color: colors.text, fontWeight: "800", fontSize: 16 },
  item: { color: colors.text, fontWeight: "600", lineHeight: 22 },
  student: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E7EB" },
  studentName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  note: { color: colors.textMuted, marginTop: 4, lineHeight: 20 },
});
