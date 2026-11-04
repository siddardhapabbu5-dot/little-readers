"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { clearToken } from "@/lib/auth-storage";
import { useRoleGate } from "@/lib/use-role-gate";
import { useRouter } from "next/navigation";

const TEACHER_ROLES = ["TEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN"];

type Me = {
  classrooms: Array<{
    id: string;
    name: string;
    gradeLabel: string | null;
    schoolName: string;
    studentCount: number;
  }>;
};

type Progress = {
  assignedLessons: Array<{ lessonId: string; title: string }>;
  students: Array<{
    childId: string;
    displayName: string;
    summary: {
      lessonsCompleted: number;
      lessonsInProgress: number;
      points: number;
      stars: number;
      assignedPending: number;
    };
    pendingAssignedLessons: Array<{ lessonId: string; title: string }>;
  }>;
  report: { studentCount: number; totalCompletedLessons: number; totalPoints: number };
};

type LessonRow = { id: string; title: string; wordCount: number };

export default function TeacherPortalPage() {
  const router = useRouter();
  const rolesKey = useMemo(() => TEACHER_ROLES, []);
  const { ready, token, error: gateError } = useRoleGate(rolesKey, "/teacher");
  const [me, setMe] = useState<Me | null>(null);
  const [classroomId, setClassroomId] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [lessonToAssign, setLessonToAssign] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(async () => {
    if (!token) return;
    const data = await apiRequest<Me>("/teacher/me", { token });
    setMe(data);
    if (!classroomId && data.classrooms[0]) setClassroomId(data.classrooms[0].id);
  }, [token, classroomId]);

  const loadProgress = useCallback(async () => {
    if (!token || !classroomId) {
      setProgress(null);
      return;
    }
    const data = await apiRequest<Progress>(
      `/teacher/classrooms/${classroomId}/progress`,
      { token }
    );
    setProgress(data);
  }, [token, classroomId]);

  useEffect(() => {
    if (!token) return;
    void loadMe().catch((e) => setError(String(e.message ?? e)));
    void apiRequest<LessonRow[]>("/teacher/lessons", { token })
      .then(setLessons)
      .catch(() => undefined);
  }, [token, loadMe]);

  useEffect(() => {
    if (!token || !classroomId) return;
    void loadProgress().catch((e) => setError(String(e.message ?? e)));
  }, [token, classroomId, loadProgress]);

  async function assignLesson() {
    if (!token || !classroomId || !lessonToAssign) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/teacher/classrooms/${classroomId}/lessons`, {
        method: "POST",
        token,
        body: JSON.stringify({ lessonId: lessonToAssign }),
      });
      setMessage("Lesson assigned to classroom");
      await loadProgress();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !gateError) {
    return <div style={{ padding: 24 }}>Checking teacher access…</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#f8fafc,#eef6ff)",
        color: "#1f2937",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "24px auto",
          background: "rgba(255,255,255,0.96)",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, opacity: 0.7 }}>Teacher portal</p>
            <h1 style={{ margin: "8px 0 0" }}>Classrooms &amp; progress</h1>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>

        {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span>Assigned classroom</span>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
          >
            <option value="">Select…</option>
            {(me?.classrooms ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.schoolName} — {c.name} ({c.studentCount} students)
              </option>
            ))}
          </select>
        </label>

        {!me?.classrooms.length ? (
          <p style={{ opacity: 0.75 }}>
            No classrooms assigned yet. Ask an admin to assign you to a class.
          </p>
        ) : null}

        {progress ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 10,
              }}
            >
              <div className="panel">
                Students: <strong>{progress.report.studentCount}</strong>
              </div>
              <div className="panel">
                Completions: <strong>{progress.report.totalCompletedLessons}</strong>
              </div>
              <div className="panel">
                Points: <strong>{progress.report.totalPoints}</strong>
              </div>
            </div>

            <div className="panel" style={{ display: "grid", gap: 8 }}>
              <strong>Assign published lesson</strong>
              <select
                value={lessonToAssign}
                onChange={(e) => setLessonToAssign(e.target.value)}
              >
                <option value="">Select lesson</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} ({l.wordCount} words)
                  </option>
                ))}
              </select>
              <Button disabled={busy || !lessonToAssign} onClick={() => void assignLesson()}>
                Assign to classroom
              </Button>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Assigned:{" "}
                {progress.assignedLessons.map((a) => a.title).join(", ") || "none"}
              </div>
            </div>

            <div className="panel">
              <strong>Students</strong>
              <ul style={{ paddingLeft: 18 }}>
                {progress.students.map((s) => (
                  <li key={s.childId} style={{ marginBottom: 8 }}>
                    <strong>{s.displayName}</strong> — completed{" "}
                    {s.summary.lessonsCompleted}, in progress{" "}
                    {s.summary.lessonsInProgress}, {s.summary.points} pts,{" "}
                    {s.summary.stars} stars
                    {s.pendingAssignedLessons.length ? (
                      <div style={{ fontSize: 13, opacity: 0.75 }}>
                        Pending assigned:{" "}
                        {s.pendingAssignedLessons.map((p) => p.title).join(", ")}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
