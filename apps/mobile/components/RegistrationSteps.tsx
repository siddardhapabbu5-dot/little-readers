import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

export const REGISTRATION_STEPS = [
  "Add Child",
  "Level & Grade",
  "Device",
  "Subscription",
  "Agreements",
  "Payment",
  "Receipt",
] as const;

/** Progress header shared by the 7-step parent registration screens. */
export function RegistrationSteps({ step }: { step: number }) {
  return (
    <View style={styles.wrap} accessibilityLabel={`Step ${step} of 7: ${REGISTRATION_STEPS[step - 1]}`}>
      <Text style={styles.label}>
        Step {step} of 7 · <Text style={styles.name}>{REGISTRATION_STEPS[step - 1]}</Text>
      </Text>
      <View style={styles.track}>
        {REGISTRATION_STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.seg, i < step ? styles.segOn : null, i === step - 1 ? styles.segNow : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  name: { color: colors.primaryDark, fontWeight: "800" },
  track: { flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.primarySoft },
  segOn: { backgroundColor: colors.primary },
  segNow: { backgroundColor: colors.primaryDark },
});
