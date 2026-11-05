"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type Grade = { id: string; code: string; label: string; sortOrder: number };
type Programme = {
  id: string;
  title: string;
  status: string;
  dailyTarget: number;
  startDate: string;
  endDate: string;
  grade: { code: string; label: string };
  _count?: { days: number };
};

export default function ProgrammeAdminPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [list, setList] = useState<Programme[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState<
    Array<{ id: string; title: string; body: string; isRead: boolean; type: string }>
  >([]);
  const [jobs, setJobs] = useState<
    Array<{ id: string; status: string; dueDate: string; attempts: number; lastError: string | null }>
  >([]);
  const [form, setForm] = useState({
    title: "Kids 6-month starter",
    gradeId: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
    dailyTarget: "1",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const [g, programmes, alertRows, jobRows] = await Promise.all([
      apiRequest<Grade[]>("/admin/content/grades", { token }),
      apiRequest<Programme[]>("/admin/programmes", { token }),
      apiRequest<Array<{ id: string; title: string; body: string; isRead: boolean; type: string }>>(
        "/admin/publisher/alerts?take=20",
        { token }
      ).catch(() => []),
      apiRequest<
        Array<{ id: string; status: string; dueDate: string; attempts: number; lastError: string | null }>
      >("/admin/publisher/jobs?take=20", { token }).catch(() => []),
    ]);
    const ordered = [...g].sort((a, b) => a.sortOrder - b.sortOrder);
    setGrades(ordered);
    setList(programmes);
    setAlerts(Array.isArray(alertRows) ? alertRows : []);
    setJobs(Array.isArray(jobRows) ? jobRows : []);
    setForm((f) => ({
      ...f,
      gradeId:
        f.gradeId ||
        ordered.find((x) => x.code === "GRADE_1")?.id ||
        ordered[0]?.id ||
        "",
    }));
  }, [token]);

  useEffect(() => {
    if (token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, load]);

  async function create() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<Programme>("/admin/programmes", {
        token,
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          gradeId: form.gradeId,
          startDate: form.startDate,
          endDate: form.endDate,
          dailyTarget: Number(form.dailyTarget) || 1,
        }),
      });
      await apiRequest(`/admin/programmes/${created.id}/generate`, {
        token,
        method: "POST",
        body: "{}",
      });
      setMessage("Draft created and schedule generated. Approve, then activate.");
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    if (!token) return;
    await apiRequest(`/admin/programmes/${id}/approve`, {
      token,
      method: "POST",
      body: "{}",
    });
    setMessage("Approved.");
    await load();
  }

  async function activate(id: string) {
    if (!token) return;
    if (
      !window.confirm(
        "Activate programme? Future words hide until the Asia/Kolkata backend publisher releases each day."
      )
    ) {
      return;
    }
    await apiRequest(`/admin/programmes/${id}/activate`, {
      token,
      method: "POST",
      body: "{}",
    });
    setMessage("Activated — backend publisher will release due days.");
    await load();
  }

  async function runPublisherOnce() {
    if (!token) return;
    const data = await apiRequest<{ processed: number; skipped?: boolean; reason?: string }>(
      "/admin/publisher/run-once",
      { token, method: "POST", body: "{}" }
    );
    setMessage(
      data.skipped
        ? `Publisher ${data.reason ?? "paused"} — no jobs run.`
        : `Publisher processed ${data.processed} day(s).`
    );
    await load();
  }

  async function setPublisherStatus(status: "RUNNING" | "PAUSED" | "STOPPED") {
    if (!token) return;
    await apiRequest("/admin/publisher/config", {
      token,
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setMessage(`Publisher ${status}.`);
  }

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Six-month vocabulary programme">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <p className="muted">
        Timezone Asia/Kolkata. The API process runs a database-backed daily publisher (pause /
        resume / stop supported). Activating does not start the next six-month programme.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button type="button" disabled={busy} onClick={() => void runPublisherOnce()}>
          Run due publishes
        </Button>
        <Button type="button" disabled={busy} onClick={() => void setPublisherStatus("PAUSED")}>
          Pause
        </Button>
        <Button type="button" disabled={busy} onClick={() => void setPublisherStatus("RUNNING")}>
          Resume
        </Button>
        <Button type="button" disabled={busy} onClick={() => void setPublisherStatus("STOPPED")}>
          Stop
        </Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <h2>New draft</h2>
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label>
          Grade
          <select
            value={form.gradeId}
            onChange={(e) => setForm((f) => ({ ...f, gradeId: e.target.value }))}
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </label>
        <label>
          Daily target
          <input
            value={form.dailyTarget}
            onChange={(e) => setForm((f) => ({ ...f, dailyTarget: e.target.value }))}
          />
        </label>
        <Button disabled={busy} onClick={() => void create()}>
          Create + generate
        </Button>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Programmes</h2>
        <table className="vocab-admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Days</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.grade.code}</td>
                <td>{p.status}</td>
                <td>{p._count?.days ?? 0}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  {p.status === "DRAFT" ? (
                    <Button variant="secondary" onClick={() => void approve(p.id)}>
                      Approve
                    </Button>
                  ) : null}
                  {p.status === "APPROVED" ? (
                    <Button onClick={() => void activate(p.id)}>Activate</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Publish jobs</h2>
        {!jobs.length ? <p className="muted">No recent jobs.</p> : null}
        <ul>
          {jobs.slice(0, 12).map((j) => (
            <li key={j.id}>
              {String(j.dueDate).slice(0, 10)} · {j.status} · tries {j.attempts}
              {j.lastError ? ` · ${j.lastError}` : ""}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Admin alerts</h2>
        {!alerts.length ? <p className="muted">No alerts.</p> : null}
        <ul>
          {alerts.slice(0, 12).map((a) => (
            <li key={a.id}>
              <strong>
                {a.isRead ? "" : "● "}
                {a.title}
              </strong>
              <div className="muted">{a.body}</div>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}
