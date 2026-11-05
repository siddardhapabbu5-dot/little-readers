import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PhoneFrame } from "../components/PhoneFrame";
import { checkParentSessionAlive } from "../services/api";
import { clearSession, ensureClientFreshStart } from "../services/secure";
import { setUnauthorizedHandler } from "../services/session";
import { colors } from "../theme";

export default function RootLayout() {
  const router = useRouter();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void ensureClientFreshStart();
    setUnauthorizedHandler(() => {
      void (async () => {
        await clearSession();
        router.replace("/login");
      })();
    });

    const onChange = (next: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        next === "active"
      ) {
        void (async () => {
          const status = await checkParentSessionAlive();
          if (status === "revoked") {
            await clearSession();
            router.replace("/login");
          }
        })();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener("change", onChange);

    return () => {
      setUnauthorizedHandler(null);
      sub.remove();
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <PhoneFrame>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        />
      </PhoneFrame>
    </SafeAreaProvider>
  );
}
