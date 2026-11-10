import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, KeyboardScroll, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { ClassroomChallengePanel } from "../components/ClassroomChallengePanel";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors, radii } from "../theme";

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

type LessonRow = { id: string; title: string; wordCount?: number };
type DetailStudent = { childId: string; displayName: string };
type AssignedLesson = { lessonId: string; title?: string; lesson?: { title: string } };

export default function TeacherScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [students, setStudents] = useState<ProgressStudent[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "needs_help" | "active">("all");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [assigned, setAssigned] = useState<AssignedLesson[]>([]);
  const [enrollId, setEnrollId] = useState("");
  const [report, setReport] = useState<{
    studentCount: number;
    totalCompletedLessons: number;
    totalPoints: number;
  } | null>(null);
  const [studentDetail, setStudentDetail] = useState<{
    childId: string;
    name: string;
    progress: any;
  } | null>(null);

  const loadClassroom = useCallback(async (id: string) => {
    const [prog, detail] = await Promise.all([
      apiRequest<{
        students: ProgressStudent[];
        report: {
          studentCount: number;
          totalCompletedLessons: number;
          totalPoints: number;
        };
      }>(`/teacher/classrooms/${id}/progress`),
      apiRequest<{
        students?: DetailStudent[];
        assignedLessons?: AssignedLesson[];
        lessons?: AssignedLesson[];
      }>(`/teacher/classrooms/${id}`).catch(() => null),
    ]);
    setStudents(prog.students);
    setReport(prog.report);
    const assignedList =
      detail?.assignedLessons ??
      detail?.lessons ??
      [];
    setAssigned(assignedList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const [me, published] = await Promise.all([
            apiRequest<{ classrooms: Classroom[] }>("/teacher/me"),
            apiRequest<LessonRow[]>("/teacher/lessons").catch(() => []),
          ]);
          setClassrooms(me.classrooms);
          setLessons(published);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.displayName.toLowerCase().includes(q)) return false;
      if (filter === "needs_help") {
        return s.summary.assignedPending > 0 || s.summary.lessonsCompleted === 0;
      }
      if (filter === "active") {
        return s.summary.lessonsInProgress > 0 || s.summary.lessonsCompleted > 0;
      }
      return true;
    });
  }, [students, query, filter]);

  async function selectClassroom(id: string) {
    setSelectedId(id);
    setStudentDetail(null);
    setInfo(null);
    try {
      await loadClassroom(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Load failed");
    }
  }

  async function assignLesson(lessonId: string) {
    if (!selectedId) return;
    setError(null);
    try {
      await apiRequest(`/teacher/classrooms/${selectedId}/lessons`, {
        method: "POST",
        body: JSON.stringify({ lessonId }),
      });
      setInfo("Lesson assigned to classroom");
      await loadClassroom(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Assign failed");
    }
  }

  async function unassignLesson(lessonId: string) {
    if (!selectedId) return;
    try {
      await apiRequest(`/teacher/classrooms/${selectedId}/lessons/${lessonId}`, {
        method: "DELETE",
      });
      setInfo("Lesson removed from classroom");
      await loadClassroom(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unassign failed");
    }
  }

  async function enrollStudent() {
    if (!selectedId || !enrollId.trim()) return;
    setError(null);
    try {
      await apiRequest(`/teacher/classrooms/${selectedId}/students`, {
        method: "POST",
        body: JSON.stringify({ childId: enrollId.trim() }),
      });
      setInfo("Student enrolled");
      setEnrollId("");
      await loadClassroom(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enroll failed — check child ID access");
    }
  }

  async function unenrollStudent(childId: string) {
    if (!selectedId) return;
    try {
      await apiRequest(`/teacher/classrooms/${selectedId}/students/${childId}`, {
        method: "DELETE",
      });
      setInfo("Student removed from classroom");
      await loadClassroom(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unenroll failed");
    }
  }

  async function openStudentProgress(childId: string, name: string) {
    setError(null);
    try {
      const progress = await apiRequest(`/learning/progress/${childId}`);
      setStudentDetail({ childId, name, progress });
    } catch (e) {
      // Teachers may not have learning/progress access — show classroom summary only.
      setStudentDetail({
        childId,
        name,
        progress: null,
      });
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setInfo(
          "Detailed learning progress is parent-scoped. Classroom lesson stats are shown above."
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Could not load student progress");
      }
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.teacher}>
      <SafeAreaView style={styles.safe}>
        <SoftButton label="← Back" onPress={() => router.back()} />
        <Title>Teacher dashboard</Title>
        <Text style={styles.note}>
          Only classrooms assigned to you are listed. Device lock applies to child
          accounts, not teachers.
        </Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <KeyboardScroll contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Assigned classrooms</Text>
            {!classrooms.length ? (
              <Text style={styles.item}>No classrooms assigned yet.</Text>
            ) : (
              classrooms.map((c) => (
                <SoftButton
                  key={c.id}
                  label={`${c.schoolName} · ${c.name} (${c.studentCount})`}
                  active={selectedId === c.id}
                  onPress={() => void selectClassroom(c.id)}
                />
              ))
            )}
          </Card>

          {selectedId && report ? (
            <Card style={{ gap: 6 }} color="#ECFDF5">
              <Text style={styles.section}>Class summary</Text>
              <Text style={styles.item}>Students: {report.studentCount}</Text>
              <Text style={styles.item}>
                Lesson completions: {report.totalCompletedLessons}
              </Text>
              <Text style={styles.item}>Total points: {report.totalPoints}</Text>
            </Card>
          ) : null}

          {selectedId ? <ClassroomChallengePanel classroomId={selectedId} /> : null}

          {selectedId ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Assign published lesson</Text>
              {!lessons.length ? (
                <Text style={styles.item}>No published lessons available.</Text>
              ) : (
                lessons.slice(0, 12).map((l) => (
                  <View key={l.id} style={styles.row}>
                    <Text style={styles.item}>
                      {l.title}
                      {l.wordCount != null ? ` · ${l.wordCount} words` : ""}
                    </Text>
                    <SoftButton label="Assign" onPress={() => void assignLesson(l.id)} />
                  </View>
                ))
              )}
              {assigned.length ? (
                <>
                  <Text style={styles.section}>Assigned to class</Text>
                  {assigned.map((a) => {
                    const id = a.lessonId;
                    const title = a.title ?? a.lesson?.title ?? id;
                    return (
                      <View key={id} style={styles.row}>
                        <Text style={styles.item}>{title}</Text>
                        <SoftButton
                          label="Remove"
                          onPress={() => void unassignLesson(id)}
                        />
                      </View>
                    );
                  })}
                </>
              ) : null}
            </Card>
          ) : null}

          {selectedId ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Enroll student (child ID)</Text>
              <TextInput
                style={styles.input}
                placeholder="Child profile ID"
                value={enrollId}
                onChangeText={setEnrollId}
                autoCapitalize="none"
              />
              <SoftButton label="Enroll in classroom" onPress={() => void enrollStudent()} />
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Students</Text>
            <TextInput
              style={styles.input}
              placeholder="Search by name"
              value={query}
              onChangeText={setQuery}
            />
            <View style={styles.filters}>
              <SoftButton
                label="All"
                active={filter === "all"}
                onPress={() => setFilter("all")}
              />
              <SoftButton
                label="Needs help"
                active={filter === "needs_help"}
                onPress={() => setFilter("needs_help")}
              />
              <SoftButton
                label="Active"
                active={filter === "active"}
                onPress={() => setFilter("active")}
              />
            </View>
            {!filtered.length ? (
              <Text style={styles.item}>No students match this filter.</Text>
            ) : (
              filtered.map((s) => (
                <View key={s.childId} style={styles.student}>
                  <Text style={styles.studentName}>{s.displayName}</Text>
                  <Text style={styles.item}>
                    Completed {s.summary.lessonsCompleted} · In progress{" "}
                    {s.summary.lessonsInProgress} · {s.summary.points} pts ·{" "}
                    {s.summary.stars}★ · Pending {s.summary.assignedPending}
                  </Text>
                  <View style={styles.row}>
                    <SoftButton
                      label="View progress"
                      onPress={() => void openStudentProgress(s.childId, s.displayName)}
                    />
                    <SoftButton
                      label="Remove"
                      onPress={() => void unenrollStudent(s.childId)}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>

          {studentDetail ? (
            <Card style={{ gap: 8 }} color="#EEF2FF">
              <Text style={styles.section}>{studentDetail.name}</Text>
              {studentDetail.progress?.summary ? (
                <>
                  <Text style={styles.item}>
                    Words correct{" "}
                    {studentDetail.progress.summary.wordsCorrect ??
                      studentDetail.progress.summary.wordsLearned ??
                      0}{" "}
                    · Accuracy {studentDetail.progress.summary.accuracy ?? 0}% · Need
                    practice {studentDetail.progress.summary.wordsNeedingPractice ?? 0}
                  </Text>
                  <Text style={styles.item}>
                    Today {studentDetail.progress.summary.daily?.wordsLearnedToday ?? 0}/
                    {studentDetail.progress.summary.daily?.target ?? 5} · Week{" "}
                    {studentDetail.progress.summary.weekly?.wordsLearned ?? 0}
                  </Text>
                  {(studentDetail.progress.weakWords ?? [])
                    .slice(0, 6)
                    .map((w: { wordId: string; text: string; emoji: string }) => (
                      <Text key={w.wordId} style={styles.item}>
                        {w.emoji} {w.text}
                      </Text>
                    ))}
                  {(studentDetail.progress.categories ?? [])
                    .slice(0, 8)
                    .map(
                      (c: {
                        categoryId: string;
                        label: string;
                        emoji?: string;
                        progressPct?: number;
                        completed?: boolean;
                      }) => (
                        <Text key={c.categoryId} style={styles.item}>
                          {c.emoji ?? "📚"} {c.label} ·{" "}
                          {c.progressPct != null
                            ? `${c.progressPct}%`
                            : c.completed
                              ? "done"
                              : "in progress"}
                        </Text>
                      )
                    )}
                  {(studentDetail.progress.achievements ?? [])
                    .filter((a: { unlocked: boolean }) => a.unlocked)
                    .slice(0, 5)
                    .map((a: { code: string; title: string }) => (
                      <Text key={a.code} style={styles.item}>
                        🏅 {a.title}
                      </Text>
                    ))}
                </>
              ) : (
                <Text style={styles.item}>
                  Classroom lesson stats only (full learning report is parent-authorized).
                </Text>
              )}
              <SoftButton label="Close" onPress={() => setStudentDetail(null)} />
            </Card>
          ) : null}
        </KeyboardScroll>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 10 },
  section: { color: colors.text, fontWeight: "800", fontSize: 16 },
  item: { color: colors.text, fontWeight: "600", lineHeight: 22 },
  student: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  studentName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  note: { color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  info: { color: colors.success, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.text,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
});
