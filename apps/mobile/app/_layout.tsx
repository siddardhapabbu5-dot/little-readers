import { useEffect, useRef } from "react";
import {
  AppState,
  Pressable,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PhoneFrame } from "../components/PhoneFrame";
import { checkParentSessionAlive } from "../services/api";
import { clearSession, ensureClientFreshStart } from "../services/secure";
import { setUnauthorizedHandler } from "../services/session";
import { colors } from "../theme";

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
  const router = useRouter();
  const appState = useRef(AppState.currentState);

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
            const status = await checkParentSessionAlive();
            if (status === "revoked") {
              await clearSession();
              router.replace("/login");
            }
          } catch {
            /* ignore transient network errors on resume */
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
