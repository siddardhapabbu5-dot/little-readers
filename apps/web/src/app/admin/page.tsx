"use client";

import Link from "next/link";
import { Alert } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";

export default function AdminPage() {
  const { ready, error } = useAdminGate();

  if (!ready && !error) {
    return (
      <div className="admin-shell">
        <div className="panel" style={{ background: "#111827", color: "#e2e8f0" }}>
          Checking admin access…
        </div>
      </div>
    );
  }

  return (
    <AdminShell title="Admin dashboard">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p style={{ color: "#cbd5e1" }}>
        Manage learning content. Vocabulary uploads feed Kids Zone automatically
        after import.
      </p>
      <div className="vocab-admin-cards">
        <Link href="/admin/vocabulary">Vocabulary Management</Link>
        <Link href="/admin/vocabulary/lessons">Manage Lessons</Link>
        <Link href="/admin/subscriptions">Subscriptions &amp; Seats</Link>
        <Link href="/admin/schools">Schools</Link>
        <Link href="/admin/vocabulary/upload">Upload Vocabulary</Link>
        <Link href="/admin/vocabulary/imports">Import History</Link>
        <Link href="/admin/vocabulary/words">Manage Words</Link>
      </div>
    </AdminShell>
  );
}
