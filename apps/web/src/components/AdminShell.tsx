"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@little-readers/ui";
import { clearToken } from "@/lib/auth-storage";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/vocabulary", label: "Vocabulary Management" },
  { href: "/admin/vocabulary/grades", label: "Manage Grades" },
  { href: "/admin/vocabulary/levels", label: "Manage Levels" },
  { href: "/admin/vocabulary/groups", label: "Manage Groups" },
  { href: "/admin/vocabulary/categories", label: "Manage Categories" },
  { href: "/admin/vocabulary/dictionary", label: "Dictionary → Grades" },
  { href: "/admin/vocabulary/words", label: "Manage Words" },
  { href: "/admin/vocabulary/lessons", label: "Manage Lessons" },
  { href: "/admin/subscriptions", label: "Subscriptions & Seats" },
  { href: "/admin/schools", label: "Schools" },
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
              key={item.href}
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
