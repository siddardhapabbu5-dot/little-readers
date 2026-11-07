"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { API_URL, apiRequest, apiUpload, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type Grade = { id: string; code: string; label: string };
type Level = {
  id: string;
  code: string;
  label: string;
  gradeId?: string | null;
  grade?: { id: string } | null;
};
type Group = { id: string; code: string; label: string; levelId: string };
type Category = {
  id: string;
  code: string;
  label: string;
  groupId: string;
  group?: { label: string; level?: { label: string; grade?: { label: string } | null } };
};

type WordRow = {
  id: string;
  text: string;
  meaning: string;
  phonetic: string | null;
  emoji: string;
  difficulty: number;
  sortOrder: number;
  isActive: boolean;
  origin: string;
  categoryId: string;
  category: {
    id: string;
    label: string;
    group: {
      id: string;
      label: string;
      level: {
        id: string;
        label: string;
        grade: { id: string; code: string; label: string } | null;
      };
    };
  };
  dictionarySense?: {
    definition: string;
    entry: {
      headword: string;
      pronunciation: string | null;
      sourceName: string | null;
      licence: string | null;
    };
  } | null;
  _count?: { attempts: number; publishedFrom: number };
};

type WordList = { total: number; take: number; skip: number; words: WordRow[] };

type WordDetail = WordRow & {
  publishedFrom?: Array<{
    id: string;
    status: string;
    confidenceScore: number;
    grade: { code: string; label: string };
  }>;
  _count: { attempts: number };
};

type Assignment = {
  id: string;
  status: string;
  confidenceScore: number;
  difficultyScore: number;
  explanation: string;
  grade: { code: string; label: string };
  category: { label: string };
  sense: { definition: string; entry: { headword: string } };
};

type BulkResult = {
  updated: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string }>;
};

export default function ManageVocabularyWordsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [list, setList] = useState<WordList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState<"all" | "true" | "false">("all");
  const [origin, setOrigin] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("");

  const [edit, setEdit] = useState({
    text: "",
    meaning: "",
    phonetic: "",
    emoji: "",
    difficulty: 1,
    sortOrder: 0,
    isActive: true,
  });
  const [reclassCategoryId, setReclassCategoryId] = useState("");

  const [assignStatus, setAssignStatus] = useState("PENDING");
  const [maxConfidence, setMaxConfidence] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssign, setSelectedAssign] = useState<Record<string, boolean>>({});

  const filteredLevels = useMemo(
    () =>
      levels.filter(
        (l) => !gradeId || l.gradeId === gradeId || l.grade?.id === gradeId
      ),
    [levels, gradeId]
  );
  const filteredGroups = useMemo(
    () => groups.filter((g) => !levelId || g.levelId === levelId),
    [groups, levelId]
  );
  const filteredCategories = useMemo(
    () => categories.filter((c) => !groupId || c.groupId === groupId),
    [categories, groupId]
  );

  const loadMeta = useCallback(async () => {
    if (!token) return;
    const [g, l, gr, c] = await Promise.all([
      apiRequest<Grade[]>("/admin/content/grades", { token }),
      apiRequest<Level[]>("/admin/content/levels", { token }),
      apiRequest<Group[]>("/admin/content/groups", { token }),
      apiRequest<Category[]>("/admin/content/categories", { token }),
    ]);
    setGrades(g);
    setLevels(l);
    setGroups(gr);
    setCategories(c);
  }, [token]);

  const loadWords = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    params.set("take", "100");
    if (q.trim()) params.set("q", q.trim());
    if (gradeId) params.set("gradeId", gradeId);
    if (levelId) params.set("levelId", levelId);
    if (groupId) params.set("groupId", groupId);
    if (categoryId) params.set("categoryId", categoryId);
    if (isActive !== "all") params.set("isActive", isActive);
    if (origin) params.set("origin", origin);
    if (assignmentStatus) params.set("assignmentStatus", assignmentStatus);
    const data = await apiRequest<WordList>(`/admin/vocabulary/words?${params}`, {
      token,
    });
    setList(data);
  }, [
    token,
    q,
    gradeId,
    levelId,
    groupId,
    categoryId,
    isActive,
    origin,
    assignmentStatus,
  ]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      const data = await apiRequest<WordDetail>(`/admin/vocabulary/words/${id}`, {
        token,
      });
      setDetail(data);
      setSelectedId(id);
      setEdit({
        text: data.text,
        meaning: data.meaning,
        phonetic: data.phonetic ?? "",
        emoji: data.emoji,
        difficulty: data.difficulty,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      });
      setReclassCategoryId(data.categoryId);
    },
    [token]
  );

  const loadAssignments = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    params.set("take", "80");
    if (assignStatus) params.set("status", assignStatus);
    if (gradeId) params.set("gradeId", gradeId);
    if (maxConfidence.trim()) params.set("maxConfidence", maxConfidence.trim());
    const data = await apiRequest<Assignment[]>(
      `/admin/dictionary/assignments?${params}`,
      { token }
    );
    setAssignments(data);
    setSelectedAssign({});
  }, [token, assignStatus, gradeId, maxConfidence]);

  useEffect(() => {
    if (!token) return;
    void loadMeta().catch((e) =>
      setError(e instanceof ApiClientError ? e.message : "Failed to load structure")
    );
  }, [token, loadMeta]);

  useEffect(() => {
    if (!token) return;
    void loadWords().catch((e) =>
      setError(e instanceof ApiClientError ? e.message : "Failed to load words")
    );
  }, [token, loadWords]);

  async function saveWord() {
    if (!token || !selectedId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selectedId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          text: edit.text,
          meaning: edit.meaning,
          phonetic: edit.phonetic || null,
          emoji: edit.emoji,
          difficulty: Number(edit.difficulty),
          sortOrder: Number(edit.sortOrder),
          isActive: edit.isActive,
        }),
      });
      setMessage("Word saved.");
      await loadWords();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateWord() {
    if (!token || !selectedId) return;
    if (!window.confirm("Deactivate this word? Kids will stop seeing it.")) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/vocabulary/words/${selectedId}/deactivate`, {
        method: "POST",
        token,
        body: "{}",
      });
      setMessage("Word deactivated.");
      await loadWords();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWord() {
    if (!token || !selectedId) return;
    if (
      !window.confirm(
        "Hard-delete only if unused. Prefer deactivate when learning history exists."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/admin/vocabulary/words/${selectedId}`, {
        method: "DELETE",
        token,
      });
      setMessage("Word deleted.");
      setDetail(null);
      setSelectedId(null);
      await loadWords();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function reclassify() {
    if (!token || !selectedId || !reclassCategoryId) return;
    if (
      !window.confirm(
        "Move this word to another category? Word id and progress stay the same."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cat = categories.find((c) => c.id === reclassCategoryId);
      const group = groups.find((g) => g.id === cat?.groupId);
      const level = levels.find((l) => l.id === group?.levelId);
      await apiRequest(`/admin/vocabulary/words/${selectedId}/reclassify`, {
        method: "POST",
        token,
        body: JSON.stringify({
          categoryId: reclassCategoryId,
          levelId: level?.id,
          gradeId: level?.gradeId ?? level?.grade?.id ?? undefined,
        }),
      });
      setMessage("Word reclassified (same id).");
      await loadWords();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Reclassify failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkAct(action: "approve" | "reject" | "publish") {
    if (!token) return;
    const ids = Object.entries(selectedAssign)
      .filter(([, on]) => on)
      .map(([id]) => id);
    if (!ids.length) {
      setError("Select at least one assignment.");
      return;
    }
    if (
      !window.confirm(
        `${action.toUpperCase()} ${ids.length} assignment(s)? Existing review rules still apply.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<BulkResult>(
        `/admin/dictionary/assignments/bulk-${action}`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ ids }),
        }
      );
      const fails = data.results.filter((r) => !r.ok);
      setMessage(
        `Bulk ${action}: ${data.updated} ok, ${data.failed} failed.` +
          (fails.length
            ? ` Failures: ${fails.map((f) => `${f.id}: ${f.error}`).join("; ")}`
            : "")
      );
      await loadAssignments();
      await loadWords();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Bulk action failed");
    } finally {
      setBusy(false);
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
    <AdminShell title="Manage Vocabulary Words">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <p style={{ color: "#94a3b8", margin: 0 }}>
          Search and edit kids vocabulary. One A–Z XLSX can hold tabs per category (A-Z Alphabet,
          A-Z Fruits, …). Select a category to import its matching tab, or upload with no filter
          to fill every matching tab. Reclassification keeps the same word id.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8,
          }}
        >
          <label>
            Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="word or meaning" />
          </label>
          <label>
            Grade
            <select
              value={gradeId}
              onChange={(e) => {
                setGradeId(e.target.value);
                setLevelId("");
                setGroupId("");
                setCategoryId("");
              }}
            >
              <option value="">All</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setGroupId("");
                setCategoryId("");
              }}
            >
              <option value="">All</option>
              {filteredLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setCategoryId("");
              }}
            >
              <option value="">All</option>
              {filteredGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value as "all" | "true" | "false")}
            >
              <option value="all">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <label>
            Origin
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">All</option>
              <option value="LEGACY">LEGACY</option>
              <option value="DICTIONARY">DICTIONARY</option>
              <option value="CATEGORY_IMPORT">CATEGORY_IMPORT</option>
            </select>
          </label>
          <label>
            Assignment status
            <select
              value={assignmentStatus}
              onChange={(e) => setAssignmentStatus(e.target.value)}
            >
              <option value="">Any</option>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PUBLISHED">PUBLISHED</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void loadWords()} disabled={busy}>
            Apply filters
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !token}
            onClick={() => {
              if (!token) return;
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const params = new URLSearchParams({
                    isActive: "true",
                    format: "auto",
                  });
                  if (gradeId) params.set("gradeId", gradeId);
                  if (levelId) params.set("levelId", levelId);
                  if (groupId) params.set("groupId", groupId);
                  if (categoryId) params.set("categoryId", categoryId);
                  const res = await fetch(
                    `${API_URL}/admin/vocabulary/words/export.csv?${params}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                  );
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const cd = res.headers.get("Content-Disposition") || "";
                  const match = /filename="([^"]+)"/.exec(cd);
                  a.download = match?.[1] || "learn-wise-words.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                  setMessage(
                    "Live sheet downloaded (UTF-8 emoji). Edit in Excel, then Upload sheet."
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !token}
            onClick={() => {
              if (!token) return;
              const input = document.createElement("input");
              input.type = "file";
              input.accept =
                ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
              input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    if (categoryId) form.append("categoryId", categoryId);
                    const data = await apiUpload<{
                      created: number;
                      updated: number;
                      failed: number;
                      format?: string;
                      sheet?: string;
                      sheetsImported?: string[];
                    }>("/admin/vocabulary/words/import-sheet", form, token);
                    const sheetNote = data.sheet
                      ? ` [${data.sheet}]`
                      : data.sheetsImported?.length
                        ? ` [${data.sheetsImported.join("; ")}]`
                        : "";
                    setMessage(
                      `Imported${data.format?.startsWith("alphabet") ? " (A–Z)" : ""}${sheetNote}: ${data.created} created, ${data.updated} updated, ${data.failed} failed.`
                    );
                    await loadWords();
                  } catch (e) {
                    setError(
                      e instanceof ApiClientError ? e.message : String(e)
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              };
              input.click();
            }}
          >
            Upload sheet
          </Button>
          <Link href="/admin/vocabulary/dictionary">Dictionary upload →</Link>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>
          Words {list ? `(${list.total})` : ""}
        </h2>
        <div className="vocab-table-wrap">
          <table className="vocab-table">
            <thead>
              <tr>
                <th>Word</th>
                <th>Meaning</th>
                <th>Placement</th>
                <th>Status</th>
                <th>Attempts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list?.words ?? []).map((w) => (
                <tr key={w.id} className={selectedId === w.id ? "is-selected" : undefined}>
                  <td>
                    {w.emoji} {w.text}
                  </td>
                  <td>{w.meaning}</td>
                  <td>
                    {w.category.group.level.grade?.code ?? "—"} / {w.category.group.level.label} /{" "}
                    {w.category.label}
                  </td>
                  <td>
                    {w.isActive ? "active" : "inactive"} · {w.origin}
                  </td>
                  <td>{w._count?.attempts ?? 0}</td>
                  <td>
                    <Button onClick={() => void loadDetail(w.id)} disabled={busy}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail ? (
        <div className="panel" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>
            Edit · {detail.emoji} {detail.text}
          </h2>
          <p style={{ margin: 0, color: "#94a3b8" }}>
            id {detail.id} · attempts {detail._count.attempts}
            {detail.dictionarySense?.entry.sourceName
              ? ` · source ${detail.dictionarySense.entry.sourceName}`
              : ""}
            {detail.dictionarySense?.entry.licence
              ? ` · ${detail.dictionarySense.entry.licence}`
              : ""}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 8,
            }}
          >
            <label>
              Text
              <input
                value={edit.text}
                onChange={(e) => setEdit((s) => ({ ...s, text: e.target.value }))}
              />
            </label>
            <label>
              Emoji
              <input
                value={edit.emoji}
                onChange={(e) => setEdit((s) => ({ ...s, emoji: e.target.value }))}
              />
            </label>
            <label>
              Phonetic
              <input
                value={edit.phonetic}
                onChange={(e) => setEdit((s) => ({ ...s, phonetic: e.target.value }))}
              />
            </label>
            <label>
              Difficulty
              <input
                type="number"
                min={1}
                max={5}
                value={edit.difficulty}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, difficulty: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Sort
              <input
                type="number"
                value={edit.sortOrder}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, sortOrder: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Active
              <select
                value={edit.isActive ? "true" : "false"}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, isActive: e.target.value === "true" }))
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <label>
            Meaning
            <textarea
              rows={3}
              value={edit.meaning}
              onChange={(e) => setEdit((s) => ({ ...s, meaning: e.target.value }))}
              style={{ width: "100%" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => void saveWord()} disabled={busy}>
              Save
            </Button>
            <Button onClick={() => void deactivateWord()} disabled={busy}>
              Deactivate
            </Button>
            <Button onClick={() => void deleteWord()} disabled={busy}>
              Delete (safe)
            </Button>
          </div>

          <h3>Reclassify</h3>
          <label>
            Target category
            <select
              value={reclassCategoryId}
              onChange={(e) => setReclassCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group?.level?.grade?.label ?? "—"} / {c.group?.level?.label ?? "—"} /{" "}
                  {c.group?.label ?? "—"} / {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => void reclassify()} disabled={busy}>
            Move category (keep word id)
          </Button>
        </div>
      ) : null}

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ marginTop: 0 }}>Bulk assignment review</h2>
        <p style={{ margin: 0, color: "#94a3b8" }}>
          Filter pending or low-confidence classifications, select rows, then approve / reject /
          publish. Does not invent confidence scores.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8,
          }}
        >
          <label>
            Status
            <select value={assignStatus} onChange={(e) => setAssignStatus(e.target.value)}>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PUBLISHED">PUBLISHED</option>
            </select>
          </label>
          <label>
            Max confidence
            <input
              value={maxConfidence}
              onChange={(e) => setMaxConfidence(e.target.value)}
              placeholder="e.g. 55"
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void loadAssignments()} disabled={busy}>
            Load assignments
          </Button>
          <Button onClick={() => void bulkAct("approve")} disabled={busy}>
            Bulk approve
          </Button>
          <Button onClick={() => void bulkAct("reject")} disabled={busy}>
            Bulk reject
          </Button>
          <Button onClick={() => void bulkAct("publish")} disabled={busy}>
            Bulk publish
          </Button>
        </div>
        {!assignments.length ? <p>No assignments loaded.</p> : null}
        {assignments.map((a) => (
          <label
            key={a.id}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 8,
              borderTop: "1px solid #334155",
              paddingTop: 8,
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(selectedAssign[a.id])}
              onChange={(e) =>
                setSelectedAssign((s) => ({ ...s, [a.id]: e.target.checked }))
              }
            />
            <span>
              <strong>
                {a.sense.entry.headword} → {a.grade.code} / {a.category.label}
              </strong>
              <br />
              {a.sense.definition}
              <br />
              confidence {a.confidenceScore} · difficulty {a.difficultyScore} · {a.status}
            </span>
          </label>
        ))}
      </div>
    </AdminShell>
  );
}
