"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest, ApiClientError } from "@/lib/api";

type Group = { id: string; code: string; label: string; level?: { code: string } };
type Category = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  emoji: string;
  sortOrder: number;
  isPublished: boolean;
  groupId: string;
  group?: {
    code: string;
    level?: { code: string; grade?: { code: string } | null };
  };
  _count?: { words: number; sessions: number; assignments: number };
};

export default function ManageCategoriesPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [rows, setRows] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    groupId: "",
    code: "",
    label: "",
    description: "",
    emoji: "📚",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const [g, c] = await Promise.all([
      apiRequest<Group[]>("/admin/content/groups", { token }),
      apiRequest<Category[]>("/admin/content/categories", { token }),
    ]);
    setGroups(g);
    setRows(c);
    if (!form.groupId && g[0]) setForm((f) => ({ ...f, groupId: g[0].id }));
  }, [token, form.groupId]);

  useEffect(() => {
    if (ready && token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [ready, token, load]);

  async function create() {
    if (!token) return;
    try {
      await apiRequest("/admin/content/categories", {
        method: "POST",
        token,
        body: JSON.stringify({
          groupId: form.groupId,
          code: form.code,
          label: form.label,
          description: form.description || undefined,
          emoji: form.emoji,
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
      await apiRequest(`/admin/content/categories/${id}`, {
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
    <AdminShell title="Manage Categories">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h2>Create category</h2>
        <select
          value={form.groupId}
          onChange={(e) => setForm({ ...form, groupId: e.target.value })}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.level?.code ?? "?"} / {g.code} — {g.label}
            </option>
          ))}
        </select>
        <input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
        <Button onClick={() => void create()}>Create category</Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12 }}>
        {rows.map((c) => (
          <article key={c.id} style={{ borderTop: "1px solid #ddd", paddingTop: 8 }}>
            <strong>
              {c.emoji} {c.code} — {c.label} {c.isPublished ? "" : "(unpublished)"}
            </strong>
            <p>
              {c.group?.level?.grade?.code ?? "—"} / {c.group?.level?.code} / {c.group?.code} ·
              words {c._count?.words ?? 0} · sessions {c._count?.sessions ?? 0}
            </p>
            <p>{c.description}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                onClick={() => {
                  const label = window.prompt("Label", c.label);
                  if (label) void patch(c.id, { label });
                }}
              >
                Edit name
              </Button>
              <Button
                onClick={() => {
                  const description = window.prompt("Description", c.description ?? "");
                  if (description != null) void patch(c.id, { description });
                }}
              >
                Description
              </Button>
              <Button
                onClick={() => {
                  const order = window.prompt("Sort order", String(c.sortOrder));
                  if (order != null) void patch(c.id, { sortOrder: Number(order) });
                }}
              >
                Order
              </Button>
              {c.isPublished ? (
                <Button
                  onClick={() =>
                    void apiRequest(`/admin/content/categories/${c.id}/deactivate`, {
                      method: "POST",
                      token: token!,
                      body: "{}",
                    }).then(load)
                  }
                >
                  Unpublish
                </Button>
              ) : (
                <Button onClick={() => void patch(c.id, { isPublished: true })}>Publish</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
