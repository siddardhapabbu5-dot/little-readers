import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SoftButton } from "./ui";
import {
  ADMIN_PRODUCT_GRADES,
  type AdminGradeCode,
  getAdminGrade,
  onAdminGradeChange,
  setAdminGrade,
} from "../services/admin-grade";
import { colors } from "../theme";

export function useAdminGrade(): [AdminGradeCode, (code: string) => void] {
  const [grade, setGrade] = useState<AdminGradeCode>(getAdminGrade());
  useEffect(() => onAdminGradeChange(setGrade), []);
  return [grade, setAdminGrade];
}

/** Grade 1–4 switch; every list and action below it works on this grade only. */
export function AdminGradeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Learn Wise grade</Text>
      <View style={styles.row}>
        {ADMIN_PRODUCT_GRADES.map((g) => (
          <SoftButton
            key={g.code}
            label={`Grade ${g.number} · Ages ${g.ages}`}
            active={value === g.code}
            onPress={() => onChange(g.code)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
