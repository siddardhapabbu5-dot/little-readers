import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { apiRequest, ApiError } from "../services/api";
import { routeForRole } from "../services/auth-errors";
import { clearSession, getToken, getUser, saveUser } from "../services/secure";
import { colors } from "../theme";

type AuthUser = { id: string; name: string; email: string; role: string };

export default function Index() {
  const [ready, setReady] = useState(false);
  const [href, setHref] = useState("/login");

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const cached = await getUser<AuthUser>();
      if (!token || !cached) {
        setHref("/login");
        setReady(true);
        return;
      }

      try {
        const me = await apiRequest<AuthUser>("/auth/me", { mobile: false });
        await saveUser(me);
        setHref(routeForRole(me.role));
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await clearSession();
          setHref("/login");
        } else {
          // Offline / transient: use last verified cached role.
          setHref(routeForRole(cached.role));
        }
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
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

  return <Redirect href={href as any} />;
}
