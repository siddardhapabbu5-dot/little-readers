"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";

export function useAdminGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login?next=/admin/vocabulary");
      return;
    }
    void apiRequest<{ role: string }>("/auth/me", { token: t })
      .then((user) => {
        if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
          setError("Admin role required");
          return;
        }
        setToken(t);
        setReady(true);
      })
      .catch(() => {
        clearToken();
        router.replace("/login?next=/admin/vocabulary");
      });
  }, [router]);

  return { ready, token, error };
}
