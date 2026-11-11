import { useEffect, useRef } from "react";
import {
  AppState,
  Platform,
  Pressable,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardRoot } from "../components/keyboard";
import { NetworkBanner } from "../components/NetworkBanner";
import { PhoneFrame } from "../components/PhoneFrame";
import { API_URL, checkParentSessionAlive } from "../services/api";
import { probeApiReachable } from "../services/network";
import { lockParentGate, shouldLockOnPath } from "../services/parent-gate";
import { clearSession, ensureClientFreshStart } from "../services/secure";
import { setUnauthorizedHandler } from "../services/session";
import { colors } from "../theme";
import { TvRoot } from "../tv/TvRoot";

/** Shows JS crash details instead of a silent close on release APKs. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.bg,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
        Something went wrong
      </Text>
      <Text style={{ marginTop: 12, color: colors.textMuted }}>
        {error?.message || "Unknown error"}
      </Text>
      <Pressable
        onPress={retry}
        style={{
          marginTop: 24,
          backgroundColor: colors.primary,
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  if (Platform.isTV) {
    return (
      <SafeAreaProvider>
        <TvRoot />
      </SafeAreaProvider>
    );
  }
  return <PhoneLayout />;
}

function PhoneLayout() {
  const router = useRouter();
  const appState = useRef(AppState.currentState);
  const pathname = usePathname();

  useEffect(() => {
    if (shouldLockOnPath(pathname)) lockParentGate();
  }, [pathname]);

  useEffect(() => {
    void ensureClientFreshStart().catch(() => undefined);
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
          try {
            await probeApiReachable(`${API_URL}/health`);
            const status = await checkParentSessionAlive();
            if (status === "revoked") {
              await clearSession();
              router.replace("/login");
            }
          } catch {
            /* ignore transient network errors on resume — do not invent offline sync */
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
      <KeyboardRoot>
        <StatusBar style="dark" />
        <NetworkBanner />
        <PhoneFrame>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "slide_from_right",
            }}
          />
        </PhoneFrame>
      </KeyboardRoot>
    </SafeAreaProvider>
  );
}
