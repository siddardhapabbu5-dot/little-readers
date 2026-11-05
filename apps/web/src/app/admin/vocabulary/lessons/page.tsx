"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type Category = {
  id: string;
  label: string;
  code: string;
  group?: {
    code: string;
    level?: {
      code: string;
      grade?: { code: string; label: string } | null;
    } | null;
  } | null;
};

function categoryOptionLabel(c: Category) {
  const grade = c.group?.level?.grade?.label ?? c.group?.level?.code ?? "";
  return grade ? `${grade} · ${c.label}` : c.label;
}
type WordOpt = { id: string; text: string; meaning: string; emoji: string; isActive: boolean };

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  category: string;
  learningCategoryId: string | null;
  isPublished: boolean;
  isActive: boolean;
  status: string;
  sortOrder: number;
  activities: string[];
  learningCategory?: { label: string } | null;
  vocabItems: Array<{
    sortOrder: number;
    vocabularyWord: WordOpt;
  }>;
  _count?: { sessions: number; childProgress: number; vocabItems: number };
};

type LessonList = { total: number; lessons: Lesson[] };

export default function ManageLessonsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [list, setList] = useState<LessonList | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryWords, setCategoryWords] = useState<WordOpt[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    learningCategoryId: "",
    sortOrder: "0",
  });
  const [wordIds, setWordIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ take: "100" });
    if (q.trim()) params.set("q", q.trim());
    const [lessons, cats] = await Promise.all([
      apiRequest<LessonList>(`/admin/lessons?${params}`, { token }),
      apiRequest<Category[]>("/admin/content/categories", { token }),
    ]);
    setList(lessons);
    setCategories(cats);
  }, [token, q]);

  useEffect(() => {
    if (token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, load]);

  async function loadWordsForCategory(categoryId: string) {
    if (!token || !categoryId) {
      setCategoryWords([]);
      return;
    }
    const data = await apiRequest<{ total: number; words: WordOpt[] }>(
      `/admin/vocabulary/words?categoryId=${categoryId}&isActive=true&take=200`,
      { token }
    );
    setCategoryWords(data.words ?? []);
  }

  async function createLesson() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<Lesson>("/admin/lessons", {
        method: "POST",
        token,
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          instructions: form.instructions || undefined,
          learningCategoryId: form.learningCategoryId || undefined,
          sortOrder: Number(form.sortOrder) || 0,
          activities: ["LISTEN", "SPELL"],
        }),
      });
      setMessage(`Created ${data.title}`);
      setSelected(data);
      setWordIds(data.vocabItems.map((v) => v.vocabularyWord.id));
      if (data.learningCategoryId) await loadWordsForCategory(data.learningCategoryId);
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openLesson(id: string) {
    if (!token) return;
    const data = await apiRequest<Lesson>(`/admin/lessons/${id}`, { token });
    setSelected(data);
    setPreview(null);
    setForm({
      title: data.title,
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      learningCategoryId: data.learningCategoryId ?? "",
      sortOrder: String(data.sortOrder),
    });
    setWordIds(data.vocabItems.map((v) => v.vocabularyWord.id));
    if (data.learningCategoryId) await loadWordsForCategory(data.learningCategoryId);
  }

  async function saveLesson() {
    if (!token || !selected) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/lessons/${selected.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          instructions: form.instructions || null,
          learningCategoryId: form.learningCategoryId || null,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      await apiRequest(`/admin/lessons/${selected.id}/words`, {
        method: "PUT",
        token,
        body: JSON.stringify({ vocabularyWordIds: wordIds }),
      });
      setMessage("Lesson saved.");
      await openLesson(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, label: string) {
    if (!token || !selected) return;
    if (!window.confirm(`${label}?`)) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/lessons/${selected.id}/${path}`, {
        method: "POST",
        token,
        body: "{}",
      });
      setMessage(`${label} ok.`);
      await openLesson(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    if (!token || !selected) return;
    const data = await apiRequest(`/admin/lessons/${selected.id}/preview`, { token });
    setPreview(data);
  }

  function toggleWord(id: string) {
    setWordIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function moveWord(id: string, dir: -1 | 1) {
    setWordIds((ids) => {
      const i = ids.indexOf(id);
      if (i < 0) return ids;
      const j = i + dir;
      if (j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Manage Lessons">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <p style={{ margin: 0, color: "#94a3b8" }}>
          Create lessons, attach published vocabulary, preview, then publish. Activities:
          Listen &amp; Spell only.{" "}
          <Link href="/admin/vocabulary/words">Manage words →</Link>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lessons"
          />
          <Button onClick={() => void load()} disabled={busy}>
            Search
          </Button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create lesson</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 8,
          }}
        >
          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label>
            Category
            <select
              value={form.learningCategoryId}
              onChange={(e) => {
                setForm((f) => ({ ...f, learningCategoryId: e.target.value }));
                void loadWordsForCategory(e.target.value);
              }}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryOptionLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <input
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Instructions
          <textarea
            rows={2}
            value={form.instructions}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            style={{ width: "100%" }}
          />
        </label>
        <Button onClick={() => void createLesson()} disabled={busy || !form.title}>
          Create draft
        </Button>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Lessons ({list?.total ?? 0})</h2>
        <table className="vocab-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Placement</th>
              <th>Words</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list?.lessons ?? []).map((l) => (
              <tr key={l.id}>
                <td>{l.title}</td>
                <td>{l.learningCategory?.label ?? l.category}</td>
                <td>{l._count?.vocabItems ?? l.vocabItems?.length ?? 0}</td>
                <td>
                  {l.isPublished ? "published" : l.status.toLowerCase()}
                  {!l.isActive ? " · inactive" : ""}
                </td>
                <td>
                  <Button onClick={() => void openLesson(l.id)} disabled={busy}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="panel" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ marginTop: 0 }}>Edit · {selected.title}</h2>
          <p style={{ margin: 0, color: "#94a3b8" }}>
            sessions {selected._count?.sessions ?? 0} · child progress{" "}
            {selected._count?.childProgress ?? 0}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 8,
            }}
          >
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label>
              Category
              <select
                value={form.learningCategoryId}
                onChange={(e) => {
                  setForm((f) => ({ ...f, learningCategoryId: e.target.value }));
                  void loadWordsForCategory(e.target.value);
                }}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryOptionLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Instructions
            <textarea
              rows={2}
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              style={{ width: "100%" }}
            />
          </label>

          <h3>Vocabulary (ordered)</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {categoryWords.map((w) => (
              <label key={w.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={wordIds.includes(w.id)}
                  onChange={() => toggleWord(w.id)}
                />
                <span>
                  {w.emoji} {w.text} — {w.meaning}
                </span>
                {wordIds.includes(w.id) ? (
                  <span style={{ display: "flex", gap: 4 }}>
                    <Button onClick={() => moveWord(w.id, -1)}>↑</Button>
                    <Button onClick={() => moveWord(w.id, 1)}>↓</Button>
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          <p style={{ color: "#94a3b8" }}>
            Selected order:{" "}
            {wordIds
              .map((id) => categoryWords.find((w) => w.id === id)?.text ?? id)
              .join(" → ") || "(none)"}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => void saveLesson()} disabled={busy}>
              Save details + words
            </Button>
            <Button onClick={() => void doPreview()} disabled={busy}>
              Preview
            </Button>
            <Button onClick={() => void act("publish", "Publish")} disabled={busy}>
              Publish
            </Button>
            <Button onClick={() => void act("unpublish", "Unpublish")} disabled={busy}>
              Unpublish
            </Button>
            <Button onClick={() => void act("deactivate", "Deactivate")} disabled={busy}>
              Deactivate
            </Button>
          </div>
          {preview ? (
            <pre style={{ overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(preview, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </AdminShell>
  );
}
