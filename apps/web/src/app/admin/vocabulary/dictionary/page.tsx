"use client";

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
  grade: { code: string; label: string };
  category: { label: string };
  sense: { definition: string; entry: { headword: string } };
};

export default function DictionaryAdminPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("English-English Dictionary");
  const [licence, setLicence] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [maxConfidence, setMaxConfidence] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPending = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ status: "PENDING", take: "50" });
    if (maxConfidence.trim()) params.set("maxConfidence", maxConfidence.trim());
    const data = await apiRequest<Assignment[]>(
      `/admin/dictionary/assignments?${params}`,
      { token }
    );
    setAssignments(data);
    setSelected({});
  }, [token, maxConfidence]);

  async function upload() {
    if (!file || !token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sourceName", sourceName);
      form.append("licence", licence);
      const data = await apiUpload<{ id: string; senseCount: number; entryCount: number }>(
        "/admin/dictionary/uploads",
        form,
        token
      );
      setBatchId(data.id);
      setMessage(
        `Imported batch ${data.id}: ${data.entryCount} entries, ${data.senseCount} new senses (pending classification).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
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
      await loadPending();
      setMessage("Classification complete. Review PENDING assignments below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "approve" | "reject" | "publish") {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/dictionary/assignments/${id}/${action}`, {
        method: "POST",
        body: "{}",
        token,
      });
      await loadPending();
      setMessage(`${action} ok for ${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
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
      await loadPending();
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
    <AdminShell title="Dictionary → Grade classification">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="panel" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <p>
          Upload one English–English dictionary. The system suggests grades; nothing reaches Kids
          Zone until you approve and publish. Automated suggestions are not a guarantee of
          developmental suitability.
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
          <Button onClick={() => void upload()} disabled={!file || busy}>
            Upload dictionary
          </Button>
          <Button onClick={() => void classify()} disabled={!batchId || busy}>
            Run classification
          </Button>
          <Button onClick={() => void loadPending()} disabled={busy}>
            Refresh pending
          </Button>
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <h2>Pending assignments</h2>
        <label>
          Max confidence (optional)
          <input
            value={maxConfidence}
            onChange={(e) => setMaxConfidence(e.target.value)}
            placeholder="e.g. 55 for low-confidence only"
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void loadPending()} disabled={busy}>
            Refresh pending
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
        {!assignments.length ? <p>No pending rows loaded.</p> : null}
        {assignments.map((a) => (
          <article key={a.id} style={{ borderTop: "1px solid #ddd", paddingTop: 8 }}>
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
                  {a.sense.entry.headword} → {a.grade.code} / {a.category.label}
                </strong>
                <p>{a.sense.definition}</p>
                <p>
                  confidence {a.confidenceScore} · difficulty {a.difficultyScore}
                </p>
                <p style={{ fontSize: 13, opacity: 0.85 }}>{a.explanation}</p>
              </span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => void act(a.id, "approve")} disabled={busy}>
                Approve
              </Button>
              <Button onClick={() => void act(a.id, "publish")} disabled={busy}>
                Publish to Kids Zone
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
