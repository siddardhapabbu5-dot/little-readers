import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PhoneFrame } from "../components/PhoneFrame";
import { clearSession } from "../services/secure";
import { setUnauthorizedHandler } from "../services/session";
import { colors } from "../theme";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void (async () => {
        await clearSession();
        router.replace("/login");
      })();
    });
    return () => setUnauthorizedHandler(null);
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
