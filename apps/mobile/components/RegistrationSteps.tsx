import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

/**
 * Progress labels for the unique parent subscription path (same live checkout).
 * Parent PIN is a gate (`RequireParentGate` / `ParentGateModal`), not a replaceable Add Child step.
 * Entry: `/subscription-entry` (after Parent PIN) → setup branch or renewal `/subscription`.
 * Route map: Grade/Phone → `/child-setup`; Subscription + Choose a Plan → `/subscription`;
 * Agreements + Payment Method → `/agreements`; receipt remains post-payment confirmation.
 */
export const REGISTRATION_STEPS = [
  "Parent PIN",
  "Learn Wise Grade",
  "Learning Phone",
  "Subscription",
  "Choose a Plan",
  "Learn Wise Agreements",
  "Payment Method",
] as const;

/** Progress header shared by the parent registration / subscription screens. */
export function RegistrationSteps({ step }: { step: number }) {
  const name = REGISTRATION_STEPS[step - 1] ?? REGISTRATION_STEPS[0];
  return (
    <View style={styles.wrap} accessibilityLabel={`Step ${step} of 7: ${name}`}>
      <Text style={styles.label}>
        Step {step} of 7 · <Text style={styles.name}>{name}</Text>
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
