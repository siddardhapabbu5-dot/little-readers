"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest, ApiClientError } from "@/lib/api";

type Grade = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  ageMin: number;
  ageMax: number;
  sortOrder: number;
  isActive: boolean;
  _count?: { levels: number; assignments: number };
};

export default function ManageGradesPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [rows, setRows] = useState<Grade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    label: "",
    ageMin: "1",
    ageMax: "3",
    description: "",
    sortOrder: "0",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const data = await apiRequest<Grade[]>("/admin/content/grades", { token });
    setRows(data);
  }, [token]);

  useEffect(() => {
    if (ready && token) {
      void load().catch((e) =>
        setError(e instanceof Error ? e.message : "Load failed")
      );
    }
  }, [ready, token, load]);

  async function create() {
    if (!token) return;
    setError(null);
    try {
      await apiRequest("/admin/content/grades", {
        method: "POST",
        token,
        body: JSON.stringify({
          code: form.code,
          label: form.label,
          ageMin: Number(form.ageMin),
          ageMax: Number(form.ageMax),
          description: form.description || undefined,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      setInfo("Grade created");
      setForm({
        code: "",
        label: "",
        ageMin: "1",
        ageMax: "3",
        description: "",
        sortOrder: "0",
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Create failed");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!token) return;
    setError(null);
    try {
      await apiRequest(`/admin/content/grades/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Update failed");
    }
  }

  async function deactivate(id: string) {
    if (!token) return;
    try {
      await apiRequest(`/admin/content/grades/${id}/deactivate`, {
        method: "POST",
        token,
        body: "{}",
      });
      setInfo("Grade deactivated (assignments unchanged)");
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Deactivate failed");
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
    <AdminShell title="Manage Grades">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h2>Create grade</h2>
        <input
          placeholder="CODE (e.g. GRADE_5)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          placeholder="Label"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <input
          placeholder="Age min"
          value={form.ageMin}
          onChange={(e) => setForm({ ...form, ageMin: e.target.value })}
        />
        <input
          placeholder="Age max"
          value={form.ageMax}
          onChange={(e) => setForm({ ...form, ageMax: e.target.value })}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          placeholder="Sort order"
          value={form.sortOrder}
          onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
        />
        <Button onClick={() => void create()}>Create</Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12 }}>
        {rows.map((g) => (
          <article key={g.id} style={{ borderTop: "1px solid #ddd", paddingTop: 8 }}>
            <strong>
              {g.code} — {g.label} {g.isActive ? "" : "(inactive)"}
            </strong>
            <p>
              Ages {g.ageMin}–{g.ageMax} · order {g.sortOrder} · levels {g._count?.levels ?? 0} ·
              assignments {g._count?.assignments ?? 0}
            </p>
            <p>{g.description}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                onClick={() => {
                  const label = window.prompt("New label", g.label);
                  if (label) void patch(g.id, { label });
                }}
              >
                Edit name
              </Button>
              <Button
                onClick={() => {
                  const min = window.prompt("Age min", String(g.ageMin));
                  const max = window.prompt("Age max", String(g.ageMax));
                  if (min && max)
                    void patch(g.id, { ageMin: Number(min), ageMax: Number(max) });
                }}
              >
                Edit ages
              </Button>
              <Button
                onClick={() => {
                  const desc = window.prompt("Description", g.description ?? "");
                  if (desc != null) void patch(g.id, { description: desc });
                }}
              >
                Description
              </Button>
              <Button
                onClick={() => {
                  const order = window.prompt("Sort order", String(g.sortOrder));
                  if (order != null) void patch(g.id, { sortOrder: Number(order) });
                }}
              >
                Order
              </Button>
              {g.isActive ? (
                <Button onClick={() => void deactivate(g.id)}>Deactivate</Button>
              ) : (
                <Button onClick={() => void patch(g.id, { isActive: true })}>Activate</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
