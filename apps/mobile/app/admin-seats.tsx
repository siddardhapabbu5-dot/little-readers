import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

type AdminSub = {
  id: string;
  plan: string;
  status: string;
  user: { id: string; name: string; email: string };
  seats: {
    included: number;
    extra: number;
    capacity: number;
    assigned: number;
    available: number;
    children: Array<{ displayName: string; hasLearningSeat: boolean }>;
  };
};

export default function AdminSeatsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminSub[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await apiRequest<AdminSub[]>("/subscriptions/admin"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function grant(parentUserId: string) {
    setBusy(true);
    setError(null);
    try {
      const seats = Number(counts[parentUserId] ?? "1") || 1;
      const data = await apiRequest<{ seatsAdded: number }>(
        "/subscriptions/seats/grant",
        {
          method: "POST",
          body: JSON.stringify({
            parentUserId,
            seats,
            amountCents: 0,
            provider: "manual_admin",
          }),
        }
      );
      setInfo(`Granted ${data.seatsAdded} seat(s).`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(parentUserId: string) {
    setBusy(true);
    setError(null);
    try {
      const seats = Number(counts[parentUserId] ?? "1") || 1;
      const data = await apiRequest<{ seatsRevoked: number }>(
        "/subscriptions/seats/revoke",
        {
          method: "POST",
          body: JSON.stringify({ parentUserId, seats }),
        }
      );
      setInfo(`Revoked ${data.seatsRevoked} seat(s).`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Seats admin</Title>
          <Text style={styles.note}>
            Manual grant/revoke only. No automatic paid activation.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
          {rows.map((row) => (
            <Card key={row.id} style={{ gap: 8 }}>
              <Text style={styles.word}>
                {row.user.name} · {row.user.email}
              </Text>
              <Text style={styles.row}>
                {row.plan} · {row.status} · seats {row.seats.assigned}/
                {row.seats.capacity} (extra {row.seats.extra})
              </Text>
              {row.seats.children.map((c, i) => (
                <Text key={`${row.id}-${i}`} style={styles.row}>
                  {c.displayName}: {c.hasLearningSeat ? "seated" : "no seat"}
                </Text>
              ))}
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={counts[row.user.id] ?? "1"}
                onChangeText={(t) =>
                  setCounts((s) => ({ ...s, [row.user.id]: t }))
                }
              />
              <SoftButton label="Grant add-on" onPress={() => void grant(row.user.id)} />
              <SoftButton label="Revoke add-on" onPress={() => void revoke(row.user.id)} />
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  note: { color: colors.textMuted, fontSize: 13 },
  info: { color: colors.primary, fontSize: 13 },
  word: { fontWeight: "800", color: colors.text, fontSize: 15 },
  row: { color: colors.textMuted, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: "#fff",
  },
});
