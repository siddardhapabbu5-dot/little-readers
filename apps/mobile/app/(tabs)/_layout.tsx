import { Tabs } from "expo-router";
import { AppTabBar } from "../../components/AppTabBar";
import { AuthGate } from "../../components/AuthGate";
import { ROLE_SETS } from "../../services/auth-errors";

export default function TabsLayout() {
  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <Tabs
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="learn" options={{ title: "Learn" }} />
        <Tabs.Screen name="games" options={{ title: "Games" }} />
        <Tabs.Screen name="rewards" options={{ title: "Rewards" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </AuthGate>
  );
}
