"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

interface ImportRow {
  id: string;
  originalFilename: string;
  status: string;
  extractedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
  importedAt: string | null;
  category?: { label: string };
  level?: { label: string };
  admin?: { name: string; email: string };
}

export default function ImportHistoryPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    batch: ImportRow;
    rows: Array<{ word: string; simpleMeaning: string; status: string; selected: boolean }>;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiRequest<ImportRow[]>("/admin/vocabulary/imports", { token })
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : "Failed to load history")
      );
  }, [token]);

  async function openDetail(id: string) {
    if (!token) return;
    setSelected(id);
    const data = await apiRequest<{
      batch: ImportRow;
      rows: Array<{ word: string; simpleMeaning: string; status: string; selected: boolean }>;
    }>(`/admin/vocabulary/imports/${id}`, { token });
    setDetail(data);
  }

  if (!ready && !gateError) {
    return <div className="admin-shell"><div className="panel">Loading…</div></div>;
  }

  return (
    <AdminShell title="Import History">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      <p>
        <Link href="/admin/vocabulary/upload">Upload another vocabulary file →</Link>
      </p>
      <table className="vocab-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>File</th>
            <th>Level</th>
            <th>Category</th>
            <th>Status</th>
            <th>Imported</th>
            <th>Admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.createdAt).toLocaleString()}</td>
              <td>{row.originalFilename}</td>
              <td>{row.level?.label}</td>
              <td>{row.category?.label}</td>
              <td>{row.status}</td>
              <td>
                {row.importedCount} (skip {row.skippedCount})
              </td>
              <td>{row.admin?.name}</td>
              <td>
                <Button variant="secondary" onClick={() => void openDetail(row.id)}>
                  Review
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && detail ? (
        <section className="vocab-panel" style={{ marginTop: 18 }}>
          <h2>Review: {detail.batch.originalFilename}</h2>
          <p>
            Extracted {detail.batch.extractedCount} · valid {detail.batch.validCount} ·
            invalid {detail.batch.invalidCount} · duplicates {detail.batch.duplicateCount}
          </p>
          <table className="vocab-table">
            <thead>
              <tr>
                <th>Word</th>
                <th>Meaning</th>
                <th>Status</th>
                <th>Selected</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.slice(0, 100).map((r, i) => (
                <tr key={`${r.word}-${i}`}>
                  <td>{r.word}</td>
                  <td>{r.simpleMeaning}</td>
                  <td>{r.status}</td>
                  <td>{r.selected ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </AdminShell>
  );
}
