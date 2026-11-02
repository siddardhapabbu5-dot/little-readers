import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { APP_NAME, APP_TAGLINE } from "@little-readers/shared";

export default function MobileHome() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>{APP_NAME}</Text>
      <Text style={styles.tag}>{APP_TAGLINE}</Text>
      <Text style={styles.body}>
        Phase 1 mobile scaffold is ready. Auth screens and kids navigation arrive
        in Phase 2 and Phase 9.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF4E8",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  brand: {
    fontSize: 32,
    fontWeight: "800",
    color: "#C2410C",
  },
  tag: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#9A3412",
  },
  body: {
    marginTop: 20,
    fontSize: 16,
    textAlign: "center",
    color: "#4B5563",
    lineHeight: 24,
  },
});
