"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest, ApiClientError } from "@/lib/api";

type Level = { id: string; code: string; label: string };
type Group = {
  id: string;
  code: string;
  label: string;
  levelId: string;
  sortOrder: number;
  isActive: boolean;
  description?: string | null;
  level?: { code: string; label: string; grade?: { code: string } | null };
  _count?: { categories: number };
};

export default function ManageGroupsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [levels, setLevels] = useState<Level[]>([]);
  const [rows, setRows] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    levelId: "",
    code: "",
    label: "",
    sortOrder: "0",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const [l, g] = await Promise.all([
      apiRequest<Level[]>("/admin/content/levels", { token }),
      apiRequest<Group[]>("/admin/content/groups", { token }),
    ]);
    setLevels(l);
    setRows(g);
    if (!form.levelId && l[0]) setForm((f) => ({ ...f, levelId: l[0].id }));
  }, [token, form.levelId]);

  useEffect(() => {
    if (ready && token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [ready, token, load]);

  async function create() {
    if (!token) return;
    try {
      await apiRequest("/admin/content/groups", {
        method: "POST",
        token,
        body: JSON.stringify({
          levelId: form.levelId,
          code: form.code,
          label: form.label,
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
      await apiRequest(`/admin/content/groups/${id}`, {
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
    <AdminShell title="Manage Groups">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h2>Create group</h2>
        <select
          value={form.levelId}
          onChange={(e) => setForm({ ...form, levelId: e.target.value })}
        >
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.label}
            </option>
          ))}
        </select>
        <input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <Button onClick={() => void create()}>Create group</Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12 }}>
        {rows.map((g) => (
          <article key={g.id} style={{ borderTop: "1px solid #ddd", paddingTop: 8 }}>
            <strong>
              {g.code} — {g.label} {g.isActive ? "" : "(inactive)"}
            </strong>
            <p>
              Level {g.level?.code} / grade {g.level?.grade?.code ?? "—"} · categories{" "}
              {g._count?.categories ?? 0}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                onClick={() => {
                  const label = window.prompt("Label", g.label);
                  if (label) void patch(g.id, { label });
                }}
              >
                Edit name
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
                <Button
                  onClick={() =>
                    void apiRequest(`/admin/content/groups/${g.id}/deactivate`, {
                      method: "POST",
                      token: token!,
                      body: "{}",
                    }).then(load)
                  }
                >
                  Deactivate
                </Button>
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
