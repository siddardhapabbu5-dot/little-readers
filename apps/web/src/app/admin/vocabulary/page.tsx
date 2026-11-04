"use client";

import Link from "next/link";
import { Alert } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { useAdminGate } from "@/lib/use-admin-gate";

const LINKS = [
  { href: "/admin/vocabulary/grades", title: "Manage Grades", desc: "Create/edit age bands (1–3, 4–6, 7–9, 10–12)" },
  { href: "/admin/vocabulary/levels", title: "Manage Levels", desc: "Difficulty levels inside each grade" },
  { href: "/admin/vocabulary/groups", title: "Manage Groups", desc: "Groups under a level (e.g. A / B)" },
  { href: "/admin/vocabulary/categories", title: "Manage Categories", desc: "Create/edit/publish categories" },
  { href: "/admin/vocabulary/words", title: "Manage Words", desc: "Search, edit, reclassify, bulk review" },
  { href: "/admin/vocabulary/lessons", title: "Manage Lessons", desc: "Create lessons, attach vocab, publish Listen/Spell" },
  { href: "/admin/vocabulary/upload", title: "Upload Vocabulary", desc: "Excel, Word, PDF import wizard" },
  { href: "/admin/vocabulary/dictionary", title: "Dictionary → Grades", desc: "Full dictionary import, auto grade suggestions, approve & publish" },
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
