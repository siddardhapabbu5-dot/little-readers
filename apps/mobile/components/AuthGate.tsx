import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { apiRequest, ApiError } from "../services/api";
import { roleAllowed, routeForRole } from "../services/auth-errors";
import { clearSession, getToken, getUser, saveUser } from "../services/secure";
import { colors } from "../theme";

type AuthUser = { id: string; name: string; email: string; role: string };

/**
 * Client route guard. Verifies local session, then refreshes role via GET /auth/me.
 * Does not replace backend authorization — API still enforces permissions.
 */
export function AuthGate({
  roles,
  children,
}: {
  roles?: readonly string[];
  children: ReactNode;
}) {
  const [state, setState] = useState<"loading" | "ok" | "login" | "forbidden">(
    "loading"
  );
  const [fallback, setFallback] = useState("/(tabs)/home");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const cached = await getUser<AuthUser>();
        if (!token || !cached) {
          if (!cancelled) setState("login");
          return;
        }

        let role = cached.role;
        try {
          const me = await apiRequest<AuthUser>("/auth/me", { mobile: false });
          await saveUser(me);
          role = me.role;
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            await clearSession();
            if (!cancelled) setState("login");
            return;
          }
          // Offline / transient: fall back to cached role for this session.
        }

        if (roles && !roleAllowed(role, roles)) {
          if (!cancelled) {
            setFallback(routeForRole(role));
            setState("forbidden");
          }
          return;
        }

        if (!cancelled) setState("ok");
      } catch {
        if (!cancelled) setState("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roles]);

  if (state === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (state === "login") {
    return <Redirect href="/login" />;
  }

  if (state === "forbidden") {
    return <Redirect href={fallback as any} />;
  }

  return <>{children}</>;
}
