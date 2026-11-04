import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AvatarBubble,
  Card,
  PrimaryButton,
  SoftButton,
  Title,
} from "../../components/ui";
import { clearSession, getUser } from "../../services/secure";
import { colors } from "../../theme";

type AuthUser = { id: string; name: string; email: string; role: string };

export default function ProfileTab() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getUser<AuthUser>().then(setUser);
    }, [])
  );

  async function logout() {
    await clearSession();
    // replace — do not leave protected screens in the back stack
    router.replace("/login");
  }

  const role = user?.role ?? "";
  const isParentFamily =
    role === "PARENT" ||
    role === "ADMIN" ||
    role === "SUPER_ADMIN" ||
    role === "SCHOOL_ADMIN";
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isTeacher = role === "TEACHER";
  const isStudent = role === "STUDENT";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AvatarBubble emoji="👤" size={72} />
          <View style={{ flex: 1 }}>
            <Title>{user?.name ?? "Profile"}</Title>
            <Text style={styles.meta}>{user?.email}</Text>
            <Text style={styles.role}>{user?.role}</Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          {isParentFamily ? (
            <>
              <MenuRow label="Parent dashboard" onPress={() => router.push("/parent")} />
              <MenuRow label="Subscription" onPress={() => router.push("/subscription")} />
              <MenuRow label="Device management" onPress={() => router.push("/devices")} />
            </>
          ) : null}

          {isAdmin ? (
            <MenuRow label="Admin overview" onPress={() => router.push("/admin")} />
          ) : null}

          {isSuperAdmin ? (
            <MenuRow label="Super Admin" onPress={() => router.push("/super-admin")} />
          ) : null}

          {isTeacher ? (
            <MenuRow
              label="Teacher (not finished on mobile)"
              disabled
              onPress={() => undefined}
            />
          ) : null}

          {isStudent ? (
            <Text style={styles.hint}>
              Parent tools (subscription, devices) are managed by your parent account.
            </Text>
          ) : null}

          {!isParentFamily && !isAdmin && !isTeacher && !isStudent ? (
            <Text style={styles.hint}>No extra account tools for this role yet.</Text>
          ) : null}
        </Card>

        <Text style={styles.note}>
          Logging out does not release the student’s registered phone. Parents/admins
          can transfer devices from Device management.
        </Text>

        <PrimaryButton label="Log out" color={colors.accent} onPress={() => void logout()} />
        {isParentFamily || isStudent ? (
          <SoftButton label="Open Learn" onPress={() => router.push("/(tabs)/learn")} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.row, disabled ? styles.rowDisabled : null]}
    >
      <Text style={[styles.rowText, disabled ? styles.rowTextDisabled : null]}>{label}</Text>
      {!disabled ? (
        <Text style={{ color: colors.primary, fontWeight: "800" }}>›</Text>
      ) : (
        <Text style={styles.soon}>Soon</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  header: { flexDirection: "row", gap: 14, alignItems: "center" },
  meta: { color: colors.textMuted },
  role: { color: colors.primary, fontWeight: "800", marginTop: 2 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowDisabled: { opacity: 0.55 },
  rowText: { fontWeight: "700", color: colors.text, fontSize: 16 },
  rowTextDisabled: { color: colors.textMuted },
  soon: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  hint: { color: colors.textMuted, lineHeight: 20, paddingVertical: 6 },
  note: { color: colors.textMuted, lineHeight: 20 },
});
