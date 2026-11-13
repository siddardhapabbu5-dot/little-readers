"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";
import { apiRequest } from "@/lib/api";

type GradeStat = {
  grade: { id: string; code: string; label: string; ageMin: number; ageMax: number };
  assigned: number;
  draft: number;
  pending: number;
  approved: number;
  published: number;
  unpublished: number;
  topicCount: number;
  insufficientTopics: Array<{
    id: string;
    code: string;
    label: string;
    activeWordCount: number;
    softTarget: number;
  }>;
};

type Dashboard = {
  softTargetPerTopic: number;
  grades: GradeStat[];
};

export default function DictionaryDashboardPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await apiRequest<Dashboard>(
        `/admin/dictionary/dashboard?${params}`,
        { token }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard failed");
    } finally {
      setBusy(false);
    }
  }, [token, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Grade vocabulary dashboard">
      {gateError ? <Alert tone="error">{gateError}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/vocabulary/dictionary">Dictionary CMS</Link>
        {" · "}
        Soft target per topic: {data?.softTargetPerTopic ?? "…"} active words
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["DRAFT", "PENDING", "APPROVED", "PUBLISHED", "UNPUBLISHED", "REJECTED"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
        <Button onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      </div>
      <div className="vocab-admin-cards">
        {(data?.grades ?? []).map((g) => (
          <div key={g.grade.id} className="panel" style={{ padding: 16 }}>
            <strong>
              {g.grade.label} (Ages {g.grade.ageMin}–{g.grade.ageMax})
            </strong>
            <ul style={{ marginTop: 8, lineHeight: 1.6 }}>
              <li>Assigned: {g.assigned}</li>
              <li>Draft: {g.draft}</li>
              <li>Pending (classified): {g.pending}</li>
              <li>Approved: {g.approved}</li>
              <li>Published: {g.published}</li>
              <li>Unpublished: {g.unpublished}</li>
              <li>Topics: {g.topicCount}</li>
            </ul>
            <p style={{ marginTop: 8 }}>
              <a href={`/api/admin/dictionary/export.xlsx?gradeId=${g.grade.id}`}>
                Export XLSX
              </a>
            </p>
            {g.insufficientTopics.length ? (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <em>Insufficient vocabulary:</em>
                <ul>
                  {g.insufficientTopics.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      {t.label}: {t.activeWordCount}/{t.softTarget}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
