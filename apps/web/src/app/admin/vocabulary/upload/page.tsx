"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, apiUpload, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

interface LevelRow {
  id: string;
  code: string;
  label: string;
  groups: Array<{
    id: string;
    code: string;
    label: string;
    categories?: never;
  }>;
}

interface GroupRow {
  id: string;
  code: string;
  label: string;
  levelId?: string;
}

interface CategoryRow {
  id: string;
  label: string;
  code: string;
  _count: { words: number };
  group: { id: string; code: string; label: string };
}

interface PreviewRow {
  rowId: string;
  serial: number;
  word: string;
  simpleMeaning: string;
  pronunciation: string;
  categoryHint: string;
  imageUrl: string;
  audioUrl: string;
  status: "valid" | "invalid" | "duplicate";
  issues: string[];
  selected: boolean;
}

interface UploadResult {
  batch: { id: string; originalFilename: string; status: string };
  rows: PreviewRow[];
  summary: {
    extractedCount: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
    selectedCount: number;
    categoryWordCount: number;
    remainingToTarget: number;
    parseNotes: string[];
    priorImportsWithSameHash: number;
  };
}

export default function UploadVocabularyPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [step, setStep] = useState(1);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [levelId, setLevelId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiRequest<LevelRow[]>("/admin/vocabulary/levels", { token }).then(setLevels);
  }, [token]);

  useEffect(() => {
    if (!token || !levelId) {
      setGroups([]);
      return;
    }
    void apiRequest<GroupRow[]>(
      `/admin/vocabulary/groups?levelId=${encodeURIComponent(levelId)}`,
      { token }
    ).then(setGroups);
  }, [token, levelId]);

  useEffect(() => {
    if (!token || !groupId) {
      setCategories([]);
      return;
    }
    void apiRequest<CategoryRow[]>(
      `/admin/vocabulary/categories?groupId=${encodeURIComponent(groupId)}`,
      { token }
    ).then(setCategories);
  }, [token, groupId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  async function extractFile() {
    if (!token || !file || !levelId || !categoryId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("levelId", levelId);
      form.append("categoryId", categoryId);
      const data = await apiUpload<UploadResult>("/admin/vocabulary/uploads", form, token);
      setUpload(data);
      setRows(data.rows);
      setStep(6);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function savePreviewEdits() {
    if (!token || !upload) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<UploadResult>(
        `/admin/vocabulary/imports/${upload.batch.id}/preview`,
        {
          method: "PUT",
          token,
          body: JSON.stringify({ rows }),
        }
      );
      setUpload(data);
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save preview");
    } finally {
      setBusy(false);
    }
  }

  async function importWords() {
    if (!token || !upload) return;
    setBusy(true);
    setError(null);
    try {
      await savePreviewEdits();
      const data = await apiRequest<{
        summary: { imported: number; skipped: number; message: string };
      }>(`/admin/vocabulary/imports/${upload.batch.id}/confirm`, {
        method: "POST",
        token,
        body: JSON.stringify({}),
      });
      setImportMessage(data.summary.message);
      setStep(7);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !gateError) {
    return <div className="admin-shell"><div className="panel">Loading…</div></div>;
  }

  return (
    <AdminShell title="Upload Vocabulary">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}

      <ol className="vocab-steps">
        {[
          "Select Level",
          "Select Group",
          "Select Category",
          "Upload File",
          "Extract",
          "Preview",
          "Import",
        ].map((label, i) => (
          <li key={label} className={step === i + 1 ? "is-active" : step > i + 1 ? "is-done" : ""}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="vocab-panel">
          <h2>Step 1 — Select Learning Level</h2>
          <select
            value={levelId}
            onChange={(e) => {
              setLevelId(e.target.value);
              setGroupId("");
              setCategoryId("");
            }}
          >
            <option value="">Choose level…</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <Button disabled={!levelId} onClick={() => setStep(2)}>
            Next
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="vocab-panel">
          <h2>Step 2 — Select Group</h2>
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setCategoryId("");
            }}
          >
            <option value="">Choose group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <div className="vocab-actions">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!groupId} onClick={() => setStep(3)}>
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="vocab-panel">
          <h2>Step 3 — Select Category</h2>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c._count.words} words)
              </option>
            ))}
          </select>
          {selectedCategory ? (
            <p>
              Current words: {selectedCategory._count.words}. Level 1 target remains 75;
              partial uploads are allowed.
            </p>
          ) : null}
          <div className="vocab-actions">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button disabled={!categoryId} onClick={() => setStep(4)}>
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 || step === 5 ? (
        <section className="vocab-panel">
          <h2>Step 4 — Upload File</h2>
          <p>Accepted: .xlsx, .xls, .docx, .doc, .pdf (max 5MB)</p>
          <div
            className={`vocab-dropzone ${dragOver ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <p>{file ? file.name : "Drag & drop a vocabulary file here"}</p>
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.doc,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="vocab-actions">
            <Button variant="secondary" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button
              loading={busy}
              disabled={!file}
              onClick={() => {
                setStep(5);
                void extractFile();
              }}
            >
              Step 5 — Extract Content
            </Button>
          </div>
        </section>
      ) : null}

      {step === 6 && upload ? (
        <section className="vocab-panel">
          <h2>Step 6 — Preview & Validate</h2>
          {upload.summary.priorImportsWithSameHash > 0 ? (
            <Alert tone="info">
              This exact file was imported before. Duplicates will be skipped.
            </Alert>
          ) : null}
          <div className="vocab-stats">
            <span>Extracted: {upload.summary.extractedCount}</span>
            <span>Valid: {rows.filter((r) => r.status === "valid").length}</span>
            <span>Invalid: {rows.filter((r) => r.status === "invalid").length}</span>
            <span>Duplicates: {rows.filter((r) => r.status === "duplicate").length}</span>
            <span>Selected: {rows.filter((r) => r.selected).length}</span>
            <span>Category now: {upload.summary.categoryWordCount}</span>
          </div>
          {upload.summary.parseNotes?.length ? (
            <ul className="vocab-notes">
              {upload.summary.parseNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}

          <div className="vocab-table-wrap">
            <table className="vocab-table">
              <thead>
                <tr>
                  <th>Use</th>
                  <th>#</th>
                  <th>Word</th>
                  <th>Simple Meaning</th>
                  <th>Pronunciation</th>
                  <th>Category hint</th>
                  <th>Image</th>
                  <th>Audio</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.rowId} className={`is-${row.status}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={row.status !== "valid"}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, selected: e.target.checked };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>{row.serial}</td>
                    <td>
                      <input
                        value={row.word}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, word: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.simpleMeaning}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, simpleMeaning: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.pronunciation}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, pronunciation: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>{row.categoryHint || selectedCategory?.label}</td>
                    <td>
                      <input
                        value={row.imageUrl}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, imageUrl: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.audioUrl}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, audioUrl: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      {row.status}
                      {row.issues.length ? ` (${row.issues.join("; ")})` : ""}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((r) => r.rowId !== row.rowId))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="vocab-actions">
            <Button variant="secondary" onClick={() => setStep(4)} disabled={busy}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => void savePreviewEdits()} loading={busy}>
              Re-validate
            </Button>
            <Button onClick={() => void importWords()} loading={busy}>
              IMPORT WORDS
            </Button>
          </div>
        </section>
      ) : null}

      {step === 7 ? (
        <section className="vocab-panel">
          <h2>Import complete</h2>
          <Alert tone="info">{importMessage}</Alert>
          <p>Approved words are immediately available in Kids Zone for this category.</p>
          <div className="vocab-actions">
            <Button
              onClick={() => {
                setStep(1);
                setFile(null);
                setUpload(null);
                setRows([]);
                setImportMessage(null);
              }}
            >
              Upload another file
            </Button>
            <Button variant="secondary" onClick={() => (window.location.href = "/admin/vocabulary/imports")}>
              View import history
            </Button>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
