import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

export type LearnWiseGrade = {
  levelId: string;
  levelCode: string;
  gradeNumber: number | null;
  gradeLabel: string;
  ageMin: number;
  ageMax: number;
  available: boolean;
};

/** Age-based suggestion only; the parent's choice always decides the grade. */
export function recommendedGrade(grades: LearnWiseGrade[], birthYear?: number | null) {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  return grades.find((g) => age >= g.ageMin && age <= g.ageMax) ?? null;
}

export function GradePicker({
  grades,
  value,
  onChange,
  birthYear,
}: {
  grades: LearnWiseGrade[];
  value: string | null;
  onChange: (levelId: string) => void;
  birthYear?: number | null;
}) {
  const recommended = recommendedGrade(grades, birthYear);
  return (
    <View style={styles.list}>
      {grades.map((g) => {
        const selected = value === g.levelId;
        return (
          <Pressable
            key={g.levelId}
            onPress={() => onChange(g.levelId)}
            disabled={!g.available}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !g.available }}
            style={[styles.option, selected && styles.optionOn, !g.available && styles.optionOff]}
          >
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title}>Grade {g.gradeNumber}</Text>
              <Text style={styles.meta}>
                Ages {g.ageMin}–{g.ageMax}
                {g.available ? "" : " · Coming soon"}
              </Text>
            </View>
            {recommended?.levelId === g.levelId ? (
              <Text style={styles.badge}>Suggested for age</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  option: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    backgroundColor: "#fff",
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionOff: { opacity: 0.5 },
  title: { fontWeight: "800", color: colors.text, fontSize: 16 },
  meta: { color: colors.textMuted },
  badge: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
