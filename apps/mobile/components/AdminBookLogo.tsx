import { Image, StyleSheet, View } from "react-native";

const LOGO = require("../assets/admin-book-logo.jpg");

/** Book + star mark for Admin header (matches mockup). */
export function AdminBookLogo({ size = 42 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Image source={LOGO} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
});
