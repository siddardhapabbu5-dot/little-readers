"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";

interface MeResponse {
  name: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    void apiRequest<MeResponse>("/auth/me", { token })
      .then((user) => {
        if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
          setError("Admin role required");
          return;
        }
        setMe(user);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  return (
    <div className="admin-shell">
      <div className="panel" style={{ background: "#111827", color: "#e2e8f0" }}>
        <h1 style={{ marginTop: 0 }}>Admin dashboard</h1>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {me ? (
          <p>
            Signed in as {me.name} ({me.email}) · role {me.role}
          </p>
        ) : (
          <p>Checking admin access…</p>
        )}
        <Alert tone="info">
          Content management (lessons, words, phonics, media uploads, quizzes)
          and analytics land in Phase 7. Database tables and seed content are
          already in place from Phase 1.
        </Alert>
        <div style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
