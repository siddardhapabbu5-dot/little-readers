import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfilePhoto } from "../../components/ProfilePhoto";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  Title,
} from "../../components/ui";
import {
  ParentGateModal,
  isParentGateUnlocked,
} from "../../components/ParentGateModal";
import { selectAdminPracticeLearner } from "../../services/admin-nav";
import { apiRequest, ApiError } from "../../services/api";
import { clearSession, getUser, saveUser } from "../../services/secure";
import { colors } from "../../theme";
import { SkyBackground } from "../../components/kids";

type AuthUser = { id: string; name: string; email: string; role: string };

type GateTarget =
  | "/parent"
  | "/subscription"
  | "/devices"
  | "/tv-connect"
  | "/privacy-request"
  | "/change-password";

export default function ProfileTab() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateTarget, setGateTarget] = useState<GateTarget | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editInfo, setEditInfo] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const local = await getUser<AuthUser>();
        setUser(local);
        try {
          const me = await apiRequest<AuthUser>("/auth/me");
          const next = {
            id: me.id,
            name: me.name,
            email: me.email,
            role: me.role,
          };
          setUser(next);
          await saveUser({ ...(local ?? {}), ...next });
        } catch {
          // Keep cached profile if offline.
        }
      })();
    }, [])
  );

  function startEdit() {
    setEditName(user?.name ?? "");
    setEditEmail(user?.email ?? "");
    setEditError(null);
    setEditInfo(null);
    setEditing(true);
  }

  async function saveProfile() {
    setEditError(null);
    setEditInfo(null);
    const name = editName.trim();
    const email = editEmail.trim().toLowerCase();
    if (!name) {
      setEditError("Name is required.");
      return;
    }
    if (!email || !email.includes("@")) {
      setEditError("Enter a valid email address.");
      return;
    }
    setEditBusy(true);
    try {
      const updated = await apiRequest<AuthUser>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name, email }),
      });
      const next = {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
      };
      const local = await getUser<AuthUser>();
      await saveUser({ ...(local ?? {}), ...next });
      setUser(next);
      setEditing(false);
      setEditInfo("Profile updated.");
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setEditBusy(false);
    }
  }

  async function logout() {
    await clearSession();
    // replace — do not leave protected screens in the back stack
    router.replace("/login");
  }

  function openAdult(target: GateTarget) {
    if (isParentGateUnlocked()) {
      router.push(target);
      return;
    }
    setGateTarget(target);
    setGateOpen(true);
  }

  const role = user?.role ?? "";
  const isParentFamily =
    role === "PARENT" ||
    role === "ADMIN" ||
    role === "SUPER_ADMIN" ||
    role === "SCHOOL_ADMIN";
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canPractice = role === "ADMIN" || role === "SUPER_ADMIN";

  async function openLearn() {
    if (canPractice) {
      try {
        await selectAdminPracticeLearner();
      } catch {
        // Learn screens show their own error if no learner can be loaded.
      }
    }
    router.push("/(tabs)/learn");
  }
  const isTeacher = role === "TEACHER" || role === "SCHOOL_ADMIN";
  const isStudent = role === "STUDENT";

  return (
    <SkyBackground>
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ProfilePhoto size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <Title>{user?.name ?? "Profile"}</Title>
            <Text style={styles.meta}>{user?.email}</Text>
            <Text style={styles.role}>{user?.role}</Text>
            {!editing ? (
              <Pressable onPress={startEdit} accessibilityRole="button" style={styles.editLink}>
                <Text style={styles.editLinkText}>Edit name & email</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {editing ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.editTitle}>Edit profile</Text>
            <Field
              label="Name"
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              editable={!editBusy}
            />
            <Field
              label="Email ID"
              value={editEmail}
              onChangeText={setEditEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!editBusy}
            />
            <ErrorText>{editError}</ErrorText>
            <View style={styles.editActions}>
              <SoftButton
                label="Cancel"
                onPress={() => {
                  if (editBusy) return;
                  setEditing(false);
                  setEditError(null);
                }}
              />
              <PrimaryButton
                label={editBusy ? "Saving…" : "Save"}
                onPress={() => void saveProfile()}
                disabled={editBusy}
              />
            </View>
          </Card>
        ) : null}
        {editInfo ? <Text style={styles.ok}>{editInfo}</Text> : null}

        <Card style={{ gap: 10 }}>
          {isParentFamily ? (
            <>
              <MenuRow
                label="Parent dashboard"
                onPress={() => openAdult("/parent")}
              />
              <MenuRow
                label="Subscription"
                onPress={() => openAdult("/subscription")}
              />
              <MenuRow
                label="Device management"
                onPress={() => openAdult("/devices")}
              />
              {role === "PARENT" || canPractice ? (
                <MenuRow label="Connect a TV" onPress={() => openAdult("/tv-connect")} />
              ) : null}
              <MenuRow
                label="Privacy & data requests"
                onPress={() => openAdult("/privacy-request")}
              />
            </>
          ) : null}

          {isParentFamily || isTeacher ? (
            <MenuRow
              label="Change password"
              onPress={() =>
                isParentFamily ? openAdult("/change-password") : router.push("/change-password")
              }
            />
          ) : null}

          {isAdmin ? (
            <>
              <MenuRow label="Admin overview" onPress={() => router.push("/admin")} />
              <MenuRow
                label="Manage accounts"
                onPress={() => router.push("/admin-users")}
              />
              <MenuRow
                label="Schools & classrooms"
                onPress={() => router.push("/admin-schools")}
              />
            </>
          ) : null}

          {isSuperAdmin ? (
            <MenuRow label="Super Admin" onPress={() => router.push("/super-admin")} />
          ) : null}

          {isTeacher ? (
            <MenuRow label="Teacher dashboard" onPress={() => router.push("/teacher")} />
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
          <SoftButton label="Open Learn" onPress={() => void openLearn()} />
        ) : null}
      </ScrollView>
      <ParentGateModal
        visible={gateOpen}
        onClose={() => {
          setGateOpen(false);
          setGateTarget(null);
        }}
        onUnlocked={() => {
          setGateOpen(false);
          if (gateTarget) router.push(gateTarget);
          setGateTarget(null);
        }}
      />
    </SafeAreaView>
    </SkyBackground>
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
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 20, gap: 14, width: "100%", maxWidth: 720, alignSelf: "center" },
  header: { flexDirection: "row", gap: 14, alignItems: "center" },
  meta: { color: colors.textMuted },
  role: { color: colors.primary, fontWeight: "800", marginTop: 2 },
  editLink: { alignSelf: "flex-start", marginTop: 4, paddingVertical: 2 },
  editLinkText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  editTitle: { fontWeight: "900", color: colors.text, fontSize: 16 },
  editActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ok: { color: colors.green, fontWeight: "800" },
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
