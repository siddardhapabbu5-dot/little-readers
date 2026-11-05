"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@little-readers/ui";
import { clearToken } from "@/lib/auth-storage";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/vocabulary/grades", label: "Academic Structure" },
  { href: "/admin/vocabulary", label: "Dictionary & Vocabulary" },
  { href: "/admin/vocabulary/lessons", label: "Lessons" },
  { href: "/admin/schools", label: "Students & Progress" },
  { href: "/admin/vocabulary/dictionary", label: "Dictionary upload" },
  { href: "/admin/vocabulary/words", label: "Manage Words" },
  { href: "/admin/vocabulary/programme", label: "Six-month programme" },
  { href: "/admin/vocabulary/categories", label: "Categories" },
  { href: "/admin/vocabulary/levels", label: "Levels" },
  { href: "/admin/vocabulary/groups", label: "Groups" },
  { href: "/admin/subscriptions", label: "Subscriptions & Seats" },
  { href: "/admin/vocabulary/upload", label: "Upload Vocabulary" },
  { href: "/admin/vocabulary/imports", label: "Import History" },
];

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="admin-shell vocab-admin">
      <aside className="vocab-admin-nav">
        <div className="vocab-admin-brand">Little Readers Admin</div>
        <nav>
          {NAV.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href))
                  ? "is-active"
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="secondary"
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
        >
          Log out
        </Button>
      </aside>
      <main className="vocab-admin-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
