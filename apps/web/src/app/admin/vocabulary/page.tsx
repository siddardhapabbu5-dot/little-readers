"use client";

import Link from "next/link";
import { Alert } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";

const LINKS = [
  { href: "/admin/vocabulary/grades", title: "Academic Structure", desc: "Grades → levels → groups → categories" },
  { href: "/admin/vocabulary/dictionary", title: "Dictionary upload", desc: "Import, AI grade suggestions, approve & publish" },
  { href: "/admin/vocabulary/words", title: "Vocabulary Manager", desc: "Filter by grade/category, download/upload CSV sheets" },
  { href: "/admin/vocabulary/programme", title: "Six-month programme", desc: "Schedule daily words (scheduler follow-up)" },
  { href: "/admin/vocabulary/lessons", title: "Lessons", desc: "Create lessons, attach vocab, publish Listen/Spell" },
  { href: "/admin/vocabulary/categories", title: "Categories", desc: "Create/edit/publish categories" },
  { href: "/admin/vocabulary/levels", title: "Levels", desc: "Difficulty levels inside each grade" },
  { href: "/admin/vocabulary/groups", title: "Groups", desc: "Groups under a level (e.g. A / B)" },
  { href: "/admin/vocabulary/upload", title: "Upload Vocabulary", desc: "Excel, Word, PDF import wizard" },
  { href: "/admin/vocabulary/imports", title: "Import History", desc: "Past uploads and summaries" },
];

export default function VocabularyHubPage() {
  const { ready, error } = useAdminGate();
  if (!ready && !error) {
    return <div className="admin-shell"><div className="panel">Loading…</div></div>;
  }

  return (
    <AdminShell title="Vocabulary Management">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="vocab-admin-cards">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href}>
            <strong>{item.title}</strong>
            <span>{item.desc}</span>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
