import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CountryCode } from "libphonenumber-js";
import { colors, radii } from "../theme";
import {
  findCountry,
  listCountries,
  type CountryOption,
} from "../utils/phone";

type Props = {
  value: CountryCode;
  onChange: (iso: CountryCode) => void;
  disabled?: boolean;
};

export function CountryCodePicker({ value, onChange, disabled }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = findCountry(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = listCountries();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.callingCode.includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
  }, [query]);

  function pick(c: CountryOption) {
    onChange(c.iso);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Country code ${selected.callingCode}, ${selected.name}. Tap to change.`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, disabled && { opacity: 0.6 }]}
      >
        <Text style={styles.flag}>{selected.flag}</Text>
        <Text style={styles.cc}>{selected.callingCode}</Text>
        <Text style={styles.chev}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.modal, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select country</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close country picker"
              onPress={() => setOpen(false)}
              hitSlop={8}
            >
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor="#9B8EC4"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel="Search countries"
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.iso}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={24}
            windowSize={10}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item }) => {
              const on = item.iso === value;
              return (
                <Pressable
                  onPress={() => pick(item)}
                  style={[styles.row, on && styles.rowOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={item.label}
                >
                  <Text style={styles.rowFlag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowIso}>{item.iso}</Text>
                  </View>
                  <Text style={styles.rowCc}>{item.callingCode}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No countries match that search.</Text>
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 8,
    marginRight: 4,
    borderRightWidth: 1,
    borderRightColor: "#D8D0F5",
    minHeight: 40,
  },
  flag: { fontSize: 16 },
  cc: {
    fontWeight: "800",
    color: colors.primaryDark,
    fontSize: 14,
  },
  chev: { color: "#7C6BB5", fontSize: 12, marginLeft: 2 },
  modal: { flex: 1, backgroundColor: "#F7F4FF" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  close: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: "#D8D0F5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E0F5",
  },
  rowOn: { backgroundColor: "#EDE9FE" },
  rowFlag: { fontSize: 22, width: 32, textAlign: "center" },
  rowName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  rowIso: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  rowCc: { fontWeight: "800", color: colors.primaryDark, fontSize: 14 },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    padding: 24,
    fontWeight: "600",
  },
});
