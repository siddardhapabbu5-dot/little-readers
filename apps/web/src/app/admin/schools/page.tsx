"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type SchoolRow = {
  id: string;
  name: string;
  code: string | null;
  contactEmail: string | null;
  isActive: boolean;
  teacherCount: number;
  classroomCount: number;
  studentCount: number;
};

export default function AdminSchoolsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const data = await apiRequest<SchoolRow[]>(`/admin/schools${qs}`, { token });
    setRows(data);
  }, [token, q]);

  useEffect(() => {
    if (token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, load]);

  async function createSchool() {
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/admin/schools", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      });
      setMessage("School created");
      setName("");
      setCode("");
      setContactEmail("");
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !gateError) {
    return <div className="admin-shell">Checking admin access…</div>;
  }

  return (
    <AdminShell title="Schools">
      {gateError || error ? (
        <Alert tone="error">{gateError || error}</Alert>
      ) : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
        <strong>Create school</strong>
        <input
          placeholder="School name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          placeholder="Contact email (optional)"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
        <Button disabled={busy || !name.trim()} onClick={() => void createSchool()}>
          Create
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search schools"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Search
        </Button>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {rows.map((s) => (
          <li key={s.id} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Link href={`/admin/schools/${s.id}`}>
                  <strong>{s.name}</strong>
                </Link>
                <div style={{ opacity: 0.75, fontSize: 14 }}>
                  {s.code ? `${s.code} · ` : ""}
                  {s.isActive ? "Active" : "Inactive"} · {s.teacherCount} teachers ·{" "}
                  {s.classroomCount} classrooms · {s.studentCount} students
                </div>
                {s.contactEmail ? (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{s.contactEmail}</div>
                ) : null}
              </div>
              <Link href={`/admin/schools/${s.id}`}>Manage</Link>
            </div>
          </li>
        ))}
      </ul>
      {!rows.length ? <p style={{ opacity: 0.7 }}>No schools yet.</p> : null}
    </AdminShell>
  );
}
