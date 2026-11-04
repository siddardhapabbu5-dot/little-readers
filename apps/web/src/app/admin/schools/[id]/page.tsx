"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type SchoolDetail = {
  id: string;
  name: string;
  code: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  studentCount: number;
  staff: Array<{
    id: string;
    staffRole: string;
    isActive: boolean;
    user: { id: string; name: string; email: string; isActive: boolean };
  }>;
  classrooms: Array<{
    id: string;
    name: string;
    gradeLabel: string | null;
    isActive: boolean;
    _count: { enrollments: number; teachers: number };
  }>;
};

export default function AdminSchoolDetailPage() {
  const params = useParams();
  const schoolId = String(params.id ?? "");
  const { ready, token, error: gateError } = useAdminGate();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPassword, setTPassword] = useState("");
  const [cName, setCName] = useState("");
  const [cGrade, setCGrade] = useState("");
  const [childId, setChildId] = useState("");
  const [classroomForEnroll, setClassroomForEnroll] = useState("");
  const [teacherForAssign, setTeacherForAssign] = useState("");
  const [classroomForTeacher, setClassroomForTeacher] = useState("");

  const load = useCallback(async () => {
    if (!token || !schoolId) return;
    const data = await apiRequest<SchoolDetail>(`/admin/schools/${schoolId}`, {
      token,
    });
    setSchool(data);
    if (!classroomForEnroll && data.classrooms[0]) {
      setClassroomForEnroll(data.classrooms[0].id);
    }
    if (!classroomForTeacher && data.classrooms[0]) {
      setClassroomForTeacher(data.classrooms[0].id);
    }
  }, [token, schoolId, classroomForEnroll, classroomForTeacher]);

  useEffect(() => {
    if (token && schoolId) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, schoolId, load]);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMessage(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !gateError) {
    return <div className="admin-shell">Checking admin access…</div>;
  }

  return (
    <AdminShell title={school?.name ?? "School"}>
      <p>
        <Link href="/admin/schools">← All schools</Link>
      </p>
      {gateError || error ? (
        <Alert tone="error">{gateError || error}</Alert>
      ) : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {school ? (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div>
              {school.code ? `${school.code} · ` : ""}
              {school.isActive ? "Active" : "Inactive"} · {school.studentCount} students
            </div>
            <div style={{ opacity: 0.75, fontSize: 14 }}>
              {[school.contactEmail, school.contactPhone, school.address]
                .filter(Boolean)
                .join(" · ") || "No contact details"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      apiRequest(
                        `/admin/schools/${schoolId}/${school.isActive ? "deactivate" : "activate"}`,
                        { method: "POST", token: token! }
                      ).then(() => undefined),
                    school.isActive ? "School deactivated" : "School activated"
                  )
                }
              >
                {school.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
            <strong>Add teacher</strong>
            <input placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
            <input
              placeholder="Email"
              value={tEmail}
              onChange={(e) => setTEmail(e.target.value)}
            />
            <input
              placeholder="Temporary password (min 8)"
              type="password"
              value={tPassword}
              onChange={(e) => setTPassword(e.target.value)}
            />
            <Button
              disabled={busy || !tName || !tEmail || tPassword.length < 8}
              onClick={() =>
                void run(async () => {
                  await apiRequest(`/admin/schools/${schoolId}/teachers`, {
                    method: "POST",
                    token: token!,
                    body: JSON.stringify({
                      name: tName,
                      email: tEmail,
                      password: tPassword,
                      staffRole: "TEACHER",
                    }),
                  });
                  setTName("");
                  setTEmail("");
                  setTPassword("");
                }, "Teacher created")
              }
            >
              Create teacher
            </Button>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <strong>Teachers / staff</strong>
            <ul>
              {school.staff.map((s) => (
                <li key={s.id}>
                  {s.user.name} ({s.user.email}) — {s.staffRole}{" "}
                  {s.user.isActive ? "" : "[inactive]"}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          apiRequest(`/admin/schools/teachers/${s.user.id}`, {
                            method: "PATCH",
                            token: token!,
                            body: JSON.stringify({
                              schoolId,
                              isActive: !s.user.isActive,
                            }),
                          }).then(() => undefined),
                        s.user.isActive ? "Teacher deactivated" : "Teacher activated"
                      )
                    }
                  >
                    {s.user.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
            <strong>Create classroom</strong>
            <input
              placeholder="Classroom name"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
            />
            <input
              placeholder="Grade label (optional)"
              value={cGrade}
              onChange={(e) => setCGrade(e.target.value)}
            />
            <Button
              disabled={busy || !cName.trim()}
              onClick={() =>
                void run(async () => {
                  await apiRequest(`/admin/schools/${schoolId}/classrooms`, {
                    method: "POST",
                    token: token!,
                    body: JSON.stringify({
                      name: cName.trim(),
                      gradeLabel: cGrade.trim() || undefined,
                    }),
                  });
                  setCName("");
                  setCGrade("");
                }, "Classroom created")
              }
            >
              Create classroom
            </Button>
          </div>

          <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
            <strong>Assign teacher to classroom</strong>
            <select
              value={classroomForTeacher}
              onChange={(e) => setClassroomForTeacher(e.target.value)}
            >
              {school.classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={teacherForAssign}
              onChange={(e) => setTeacherForAssign(e.target.value)}
            >
              <option value="">Select teacher</option>
              {school.staff
                .filter((s) => s.staffRole === "TEACHER" && s.user.isActive)
                .map((s) => (
                  <option key={s.user.id} value={s.user.id}>
                    {s.user.name}
                  </option>
                ))}
            </select>
            <Button
              disabled={busy || !classroomForTeacher || !teacherForAssign}
              onClick={() =>
                void run(
                  () =>
                    apiRequest(
                      `/admin/schools/classrooms/${classroomForTeacher}/teachers`,
                      {
                        method: "POST",
                        token: token!,
                        body: JSON.stringify({ teacherUserId: teacherForAssign }),
                      }
                    ).then(() => undefined),
                  "Teacher assigned"
                )
              }
            >
              Assign
            </Button>
          </div>

          <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
            <strong>Enroll existing child (by Child ID)</strong>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
              Uses the Parent→Child profile — does not create a duplicate student.
            </p>
            <select
              value={classroomForEnroll}
              onChange={(e) => setClassroomForEnroll(e.target.value)}
            >
              {school.classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Child profile id"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            />
            <Button
              disabled={busy || !classroomForEnroll || !childId.trim()}
              onClick={() =>
                void run(
                  () =>
                    apiRequest(
                      `/admin/schools/classrooms/${classroomForEnroll}/students`,
                      {
                        method: "POST",
                        token: token!,
                        body: JSON.stringify({ childId: childId.trim() }),
                      }
                    ).then(() => undefined),
                  "Child enrolled"
                )
              }
            >
              Enroll
            </Button>
          </div>

          <div className="panel">
            <strong>Classrooms</strong>
            <ul>
              {school.classrooms.map((c) => (
                <li key={c.id}>
                  <Link href={`/teacher?classroom=${c.id}`}>{c.name}</Link>
                  {c.gradeLabel ? ` · ${c.gradeLabel}` : ""} ·{" "}
                  {c.isActive ? "Active" : "Inactive"} · {c._count.teachers} teachers ·{" "}
                  {c._count.enrollments} enrollments
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}
