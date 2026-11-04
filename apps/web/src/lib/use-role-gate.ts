"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";

export function useRoleGate(allowed: string[], loginNext: string) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace(`/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    void apiRequest<{ role: string }>("/auth/me", { token: t })
      .then((user) => {
        if (!allowed.includes(user.role)) {
          setError("You do not have access to this area");
          return;
        }
        setRole(user.role);
        setToken(t);
        setReady(true);
      })
      .catch(() => {
        clearToken();
        router.replace(`/login?next=${encodeURIComponent(loginNext)}`);
      });
  }, [router, allowed, loginNext]);

  return { ready, token, role, error };
}
