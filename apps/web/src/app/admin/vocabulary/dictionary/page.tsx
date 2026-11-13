"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest, apiUpload } from "@/lib/api";

type Assignment = {
  id: string;
  status: string;
  confidenceScore: number;
  difficultyScore: number;
  explanation: string;
  meaningOverride?: string | null;
  exampleOverride?: string | null;
  grade: { code: string; label: string };
  category: { label: string };
  sense: { definition: string; entry: { headword: string } };
};

type EntryRow = {
  id: string;
  headword: string;
  pronunciation?: string | null;
  _count?: { senses: number };
  senses: Array<{ id: string; definition: string; senseIndex: number }>;
};

type PreviewResult = {
  id: string;
  validCount: number;
  errorCount: number;
  entryCount: number;
  errors: Array<{ row: number; headword: string; issues: string[] }>;
  preview: Array<{ headword: string; firstDefinition?: string; senseCount: number }>;
};

export default function DictionaryAdminPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("English-English Dictionary");
  const [licence, setLicence] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [maxConfidence, setMaxConfidence] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [manualWord, setManualWord] = useState("");
  const [manualMeaning, setManualMeaning] = useState("");
  const [manualExample, setManualExample] = useState("");
  const [overrideEdit, setOverrideEdit] = useState<Record<string, { meaning: string; example: string }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAssignments = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ status: statusFilter, take: "50" });
    if (maxConfidence.trim()) params.set("maxConfidence", maxConfidence.trim());
    const data = await apiRequest<Assignment[]>(
      `/admin/dictionary/assignments?${params}`,
      { token }
    );
    setAssignments(data);
    setSelected({});
  }, [token, maxConfidence, statusFilter]);

  async function searchEntries() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ take: "40" });
      if (searchQ.trim()) params.set("q", searchQ.trim());
      const data = await apiRequest<EntryRow[]>(`/admin/dictionary/entries?${params}`, {
        token,
      });
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function createManual() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/admin/dictionary/entries", {
        method: "POST",
        body: JSON.stringify({
          headword: manualWord,
          definition: manualMeaning,
          example: manualExample || undefined,
        }),
        token,
      });
      setMessage(`Added "${manualWord}" to central dictionary (draft senses).`);
      setManualWord("");
      setManualMeaning("");
      setManualExample("");
      await searchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!file || !token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sourceName", sourceName);
      form.append("licence", licence);
      const data = await apiUpload<PreviewResult>(
        "/admin/dictionary/uploads/preview",
        form,
        token
      );
      setPreview(data);
      setBatchId(data.id);
      setMessage(
        `Preview ready: ${data.validCount} valid, ${data.errorCount} invalid. Confirm to import. No dictionary rows written yet.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!batchId || !token) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<{ id: string; entryCount: number; senseCount: number }>(
        `/admin/dictionary/uploads/confirm/${batchId}`,
        { method: "POST", body: "{}", token }
      );
      setMessage(
        `Confirmed batch ${data.id}: ${data.entryCount} entries, ${data.senseCount} new senses. Run classification next.`
      );
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function classify() {
    if (!batchId || !token) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/dictionary/imports/${batchId}/classify`, {
        method: "POST",
        body: "{}",
        token,
      });
      setStatusFilter("PENDING");
      await loadAssignments();
      setMessage("Classification complete. Review PENDING assignments (not auto-published).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "approve" | "reject" | "publish" | "unpublish") {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "publish") {
        await apiRequest(`/admin/dictionary/assignments/${id}/approve`, {
          method: "POST",
          body: "{}",
          token,
        });
      }
      await apiRequest(`/admin/dictionary/assignments/${id}/${action}`, {
        method: "POST",
        body: "{}",
        token,
      });
      await loadAssignments();
      setMessage(`${action} ok for ${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveOverrides(id: string) {
    if (!token) return;
    const edit = overrideEdit[id];
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/dictionary/assignments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          meaningOverride: edit.meaning || null,
          exampleOverride: edit.example || null,
        }),
        token,
      });
      setMessage("Assignment overrides saved (central dictionary meaning unchanged).");
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override save failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkAct(action: "approve" | "reject" | "publish") {
    if (!token) return;
    const ids = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([id]) => id);
    if (!ids.length) {
      setError("Select at least one assignment.");
      return;
    }
    if (!window.confirm(`${action.toUpperCase()} ${ids.length} selected?`)) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<{
        updated: number;
        failed: number;
        results: Array<{ id: string; ok: boolean; error?: string }>;
      }>(`/admin/dictionary/assignments/bulk-${action}`, {
        method: "POST",
        body: JSON.stringify({ ids }),
        token,
      });
      const fails = data.results.filter((r) => !r.ok);
      setMessage(
        `Bulk ${action}: ${data.updated} ok, ${data.failed} failed` +
          (fails.length
            ? `. ${fails.map((f) => `${f.id}: ${f.error}`).join("; ")}`
            : ".")
      );
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk failed");
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
    <AdminShell title="Central English Dictionary">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/vocabulary/dictionary/dashboard">Grade vocabulary dashboard</Link>
        {" · "}
        <Link href="/admin/vocabulary">Vocabulary hub</Link>
      </p>

      <div className="panel" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <h2>Search / add words</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search headword"
          />
          <Button onClick={() => void searchEntries()} disabled={busy}>
            Search
          </Button>
        </div>
        {entries.map((e) => (
          <div key={e.id} style={{ borderTop: "1px solid #334155", paddingTop: 6 }}>
            <strong>{e.headword}</strong>
            {e.pronunciation ? ` · ${e.pronunciation}` : ""}
            <ul>
              {e.senses.map((s) => (
                <li key={s.id}>
                  [{s.senseIndex}] {s.definition}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <label>
          New word
          <input value={manualWord} onChange={(e) => setManualWord(e.target.value)} />
        </label>
        <label>
          Central meaning
          <input value={manualMeaning} onChange={(e) => setManualMeaning(e.target.value)} />
        </label>
        <label>
          Example (optional)
          <input value={manualExample} onChange={(e) => setManualExample(e.target.value)} />
        </label>
        <Button onClick={() => void createManual()} disabled={busy || !manualWord || !manualMeaning}>
          Add dictionary entry
        </Button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <h2>Upload (preview → confirm)</h2>
        <p>
          CSV/XLSX preferred (5MB max). Invalid rows are reported — nothing is written until you
          confirm. Classification suggestions never auto-publish.
        </p>
        <label>
          Source name
          <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </label>
        <label>
          Licence
          <input value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="e.g. CC BY-SA" />
        </label>
        <input
          type="file"
          accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.docx,.doc,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void runPreview()} disabled={!file || busy}>
            Preview upload
          </Button>
          <Button onClick={() => void confirmImport()} disabled={!batchId || busy}>
            Confirm import
          </Button>
          <Button onClick={() => void classify()} disabled={!batchId || busy}>
            Run classification
          </Button>
          {batchId ? (
            <a href={`/api/admin/dictionary/imports/${batchId}/errors.csv`}>
              Download error report
            </a>
          ) : null}
        </div>
        {preview ? (
          <div>
            <p>
              Valid {preview.validCount} · Invalid {preview.errorCount}
            </p>
            <ul>
              {preview.preview.slice(0, 10).map((r) => (
                <li key={r.headword}>
                  {r.headword}: {r.firstDefinition}
                </li>
              ))}
            </ul>
            {preview.errors.length ? (
              <ul style={{ color: "#fca5a5" }}>
                {preview.errors.slice(0, 15).map((e) => (
                  <li key={`${e.row}-${e.headword}`}>
                    Row {e.row} ({e.headword}): {e.issues.join("; ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <h2>Assignments</h2>
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {["DRAFT", "PENDING", "APPROVED", "PUBLISHED", "UNPUBLISHED", "REJECTED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max confidence (optional)
          <input
            value={maxConfidence}
            onChange={(e) => setMaxConfidence(e.target.value)}
            placeholder="e.g. 55 for low-confidence only"
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void loadAssignments()} disabled={busy}>
            Refresh
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
        {!assignments.length ? <p>No rows loaded for this status.</p> : null}
        {assignments.map((a) => (
          <article key={a.id} style={{ borderTop: "1px solid #334155", paddingTop: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={Boolean(selected[a.id])}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [a.id]: e.target.checked }))
                }
              />
              <span>
                <strong>
                  {a.sense.entry.headword} → {a.grade.code} / {a.category.label} [{a.status}]
                </strong>
                <p>Central: {a.sense.definition}</p>
                <p>
                  confidence {a.confidenceScore} · difficulty {a.difficultyScore}
                </p>
                <p style={{ fontSize: 13, opacity: 0.85 }}>{a.explanation}</p>
              </span>
            </label>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <input
                placeholder="Age-appropriate meaning override"
                value={
                  overrideEdit[a.id]?.meaning ?? a.meaningOverride ?? ""
                }
                onChange={(e) =>
                  setOverrideEdit((s) => ({
                    ...s,
                    [a.id]: {
                      meaning: e.target.value,
                      example: s[a.id]?.example ?? a.exampleOverride ?? "",
                    },
                  }))
                }
              />
              <input
                placeholder="Age-appropriate example override"
                value={
                  overrideEdit[a.id]?.example ?? a.exampleOverride ?? ""
                }
                onChange={(e) =>
                  setOverrideEdit((s) => ({
                    ...s,
                    [a.id]: {
                      meaning: s[a.id]?.meaning ?? a.meaningOverride ?? "",
                      example: e.target.value,
                    },
                  }))
                }
              />
              <Button onClick={() => void saveOverrides(a.id)} disabled={busy}>
                Save overrides
              </Button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <Button onClick={() => void act(a.id, "approve")} disabled={busy}>
                Approve
              </Button>
              <Button onClick={() => void act(a.id, "publish")} disabled={busy}>
                Publish
              </Button>
              <Button onClick={() => void act(a.id, "unpublish")} disabled={busy}>
                Unpublish
              </Button>
              <Button onClick={() => void act(a.id, "reject")} disabled={busy}>
                Reject
              </Button>
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
