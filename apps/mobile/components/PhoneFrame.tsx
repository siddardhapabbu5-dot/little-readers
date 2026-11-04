import { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const WEB_CSS = `
html, body, #root { height: 100%; margin: 0; overflow: hidden; background: #1A1528; }
* { scrollbar-width: none; }
*::-webkit-scrollbar { width: 0; height: 0; display: none; }
`;

/** Desktop-only shell so Expo web looks like a phone, not a website. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const id = "lr-phone-frame-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = WEB_CSS;
    document.head.appendChild(style);
  }, []);

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View style={styles.desktop}>
      <Text style={styles.hint}>Phone preview · Expo mobile UI</Text>
      <View style={styles.bezel}>
        <View style={styles.notchRow}>
          <View style={styles.notch} />
        </View>
        <View style={styles.screen}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktop: {
    flex: 1,
    height: "100%" as unknown as number,
    backgroundColor: "#1A1528",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  hint: {
    color: "#C4B5FD",
    fontWeight: "700",
    marginBottom: 10,
    fontSize: 13,
  },
  bezel: {
    width: 390,
    maxWidth: "100%" as unknown as number,
    height: 844,
    maxHeight: "94%" as unknown as number,
    backgroundColor: "#0B0B0F",
    borderRadius: 40,
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderWidth: 2,
    borderColor: "#3F3A55",
    overflow: "hidden",
  },
  notchRow: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  notch: {
    width: 118,
    height: 28,
    borderRadius: 16,
    backgroundColor: "#0B0B0F",
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    // Top-only radius so the bottom tab labels are not clipped by the curve.
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
});

