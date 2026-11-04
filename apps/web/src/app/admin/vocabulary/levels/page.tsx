"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest, ApiClientError } from "@/lib/api";

type Grade = { id: string; code: string; label: string };
type Level = {
  id: string;
  code: string;
  label: string;
  kind: string;
  gradeId?: string | null;
  ageMin: number;
  ageMax: number;
  sortOrder: number;
  isActive: boolean;
  description?: string | null;
  grade?: Grade | null;
  _count?: { groups: number; children: number; assignments: number };
};

export default function ManageLevelsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [rows, setRows] = useState<Level[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    label: "",
    gradeId: "",
    kind: "DIFFICULTY",
    ageMin: "1",
    ageMax: "3",
    sortOrder: "0",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const [g, l] = await Promise.all([
      apiRequest<Grade[]>("/admin/content/grades", { token }),
      apiRequest<Level[]>("/admin/content/levels", { token }),
    ]);
    setGrades(g);
    setRows(l);
    if (!form.gradeId && g[0]) setForm((f) => ({ ...f, gradeId: g[0].id }));
  }, [token, form.gradeId]);

  useEffect(() => {
    if (ready && token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [ready, token, load]);

  async function create() {
    if (!token) return;
    setError(null);
    try {
      await apiRequest("/admin/content/levels", {
        method: "POST",
        token,
        body: JSON.stringify({
          code: form.code,
          label: form.label,
          kind: form.kind,
          gradeId: form.gradeId || null,
          ageMin: Number(form.ageMin),
          ageMax: Number(form.ageMax),
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Create failed");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!token) return;
    try {
      await apiRequest(`/admin/content/levels/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Update failed");
    }
  }

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Manage Levels">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h2>Create level (difficulty within grade)</h2>
        <select
          value={form.gradeId}
          onChange={(e) => setForm({ ...form, gradeId: e.target.value })}
        >
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} — {g.label}
            </option>
          ))}
        </select>
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value })}
        >
          <option value="DIFFICULTY">DIFFICULTY</option>
          <option value="GRADE_BAND">GRADE_BAND</option>
        </select>
        <input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input placeholder="Age min" value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} />
        <input placeholder="Age max" value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} />
        <Button onClick={() => void create()}>Create level</Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12 }}>
        {rows.map((l) => (
          <article key={l.id} style={{ borderTop: "1px solid #ddd", paddingTop: 8 }}>
            <strong>
              {l.code} — {l.label} [{l.kind}] {l.isActive ? "" : "(inactive)"}
            </strong>
            <p>
              Grade {l.grade?.code ?? "—"} · ages {l.ageMin}–{l.ageMax} · groups{" "}
              {l._count?.groups ?? 0}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                onClick={() => {
                  const label = window.prompt("Label", l.label);
                  if (label) void patch(l.id, { label });
                }}
              >
                Edit
              </Button>
              <Button
                onClick={() => {
                  const order = window.prompt("Sort order", String(l.sortOrder));
                  if (order != null) void patch(l.id, { sortOrder: Number(order) });
                }}
              >
                Order
              </Button>
              {l.isActive ? (
                <Button
                  onClick={() =>
                    void apiRequest(`/admin/content/levels/${l.id}/deactivate`, {
                      method: "POST",
                      token: token!,
                      body: "{}",
                    }).then(load)
                  }
                >
                  Deactivate
                </Button>
              ) : (
                <Button onClick={() => void patch(l.id, { isActive: true })}>Activate</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
