import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiRequest, ApiError } from "../services/api";
import { colors, radii } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

export function ParentGateModal({ visible, onClose, onUnlocked }: Props) {
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin("");
    setConfirm("");
    setError(null);
    setPinSet(null);
    void (async () => {
      try {
        const data = await apiRequest<{ pinSet: boolean }>("/parent/auth/gate/status");
        setPinSet(data.pinSet);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load PIN status");
        setPinSet(false);
      }
    })();
  }, [visible]);

  async function submit() {
    if (loading) return;
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter a 4–6 digit PIN.");
      return;
    }
    if (pinSet === false && pin !== confirm) {
      setError("PINs do not match.");
      return;
    }
    setLoading(true);
    try {
      if (pinSet === false) {
        await apiRequest("/parent/auth/gate/set-pin", {
          method: "POST",
          body: JSON.stringify({ pin }),
        });
        parentGateUnlockUntil = Date.now() + 600 * 1000;
      } else {
        const data = await apiRequest<{ unlockSeconds: number }>(
          "/parent/auth/gate/verify-pin",
          {
            method: "POST",
            body: JSON.stringify({ pin }),
          }
        );
        parentGateUnlockUntil =
          Date.now() + (data.unlockSeconds ?? 600) * 1000;
      }
      onUnlocked();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "PIN failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {pinSet === false ? "Create Parent PIN" : "Parent PIN required"}
          </Text>
          <Text style={styles.body}>
            {pinSet === false
              ? "Set a 4–6 digit PIN before opening subscription, devices, or parent tools."
              : "Enter your parent PIN to continue."}
          </Text>
          {pinSet === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="PIN"
                placeholderTextColor="#9B8EC4"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                accessibilityLabel="Parent PIN"
              />
              {pinSet === false ? (
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={(v) => setConfirm(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Confirm PIN"
                  placeholderTextColor="#9B8EC4"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  accessibilityLabel="Confirm parent PIN"
                />
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.btn, loading && { opacity: 0.7 }]}
                disabled={loading}
                onPress={() => void submit()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {pinSet === false ? "Save PIN" : "Unlock"}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={onClose} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

let parentGateUnlockUntil = 0;

export function isParentGateUnlocked() {
  return parentGateUnlockUntil > Date.now();
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(31,22,53,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    gap: 10,
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
  },
  body: {
    color: colors.textMuted,
    fontWeight: "600",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#D8D0F5",
    backgroundColor: "#F7F4FF",
    borderRadius: radii.md,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
    color: colors.text,
  },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  cancel: { alignItems: "center", paddingVertical: 8 },
  cancelText: { color: colors.primary, fontWeight: "700" },
});
