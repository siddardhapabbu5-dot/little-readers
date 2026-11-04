"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest } from "@/lib/api";
import { clearToken } from "@/lib/auth-storage";
import { useRoleGate } from "@/lib/use-role-gate";
import { useRouter } from "next/navigation";

const SCHOOL_ROLES = ["SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN"];

type SchoolRow = {
  id: string;
  name: string;
  isActive: boolean;
  teacherCount: number;
  classroomCount: number;
  studentCount: number;
};

export default function SchoolPortalPage() {
  const router = useRouter();
  const rolesKey = useMemo(() => SCHOOL_ROLES, []);
  const { ready, token, role, error: gateError } = useRoleGate(rolesKey, "/school");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await apiRequest<SchoolRow[]>("/admin/schools", { token });
    setSchools(data);
  }, [token]);

  useEffect(() => {
    if (token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, load]);

  if (!ready && !gateError) {
    return <div style={{ padding: 24 }}>Checking school admin access…</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#f8fafc,#ecfeff)",
        padding: 24,
        color: "#1f2937",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "24px auto",
          background: "rgba(255,255,255,0.96)",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, opacity: 0.7 }}>School admin</p>
            <h1 style={{ margin: "8px 0 0" }}>Your schools</h1>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>

        {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}

        {role === "ADMIN" || role === "SUPER_ADMIN" ? (
          <p>
            Platform admins: use the full{" "}
            <Link href="/admin/schools">Schools console</Link>.
          </p>
        ) : null}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {schools.map((s) => (
            <li key={s.id} className="panel">
              <strong>{s.name}</strong>
              <div style={{ fontSize: 14, opacity: 0.75 }}>
                {s.isActive ? "Active" : "Inactive"} · {s.teacherCount} teachers ·{" "}
                {s.classroomCount} classrooms · {s.studentCount} students
              </div>
              {(role === "ADMIN" || role === "SUPER_ADMIN") && (
                <Link href={`/admin/schools/${s.id}`}>Open in Admin</Link>
              )}
              <div>
                <Link href="/teacher">Open teacher progress view</Link>
              </div>
            </li>
          ))}
        </ul>
        {!schools.length ? (
          <p style={{ opacity: 0.75 }}>No school membership found for this account.</p>
        ) : null}
      </div>
    </div>
  );
}
