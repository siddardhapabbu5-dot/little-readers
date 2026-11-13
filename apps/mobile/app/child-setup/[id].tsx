import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, SoftButton, Title } from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { RequireParentGate } from "../../components/RequireParentGate";
import { RegistrationSteps } from "../../components/RegistrationSteps";
import { GradePicker, type LearnWiseGrade } from "../../components/GradePicker";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import {
  getOrCreateInstallationId,
  getUser,
  phoneLabel,
  saveActiveChild,
} from "../../services/secure";
import { colors, radii } from "../../theme";

type ChildRow = {
  id: string;
  displayName: string;
  birthYear?: number | null;
  levelId?: string | null;
};
type DeviceChoice = "this" | "own";

export default function ChildSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<2 | 3>(2);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [grades, setGrades] = useState<LearnWiseGrade[]>([]);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLockHere = Platform.OS !== "web";

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const [kids, gr] = await Promise.all([
            apiRequest<ChildRow[]>("/children"),
            apiRequest<LearnWiseGrade[]>("/children/learn-wise-grades"),
          ]);
          const found = kids.find((k) => k.id === id) ?? null;
          setChild(found);
          setGrades(gr);
          const current = gr.find((g) => g.available && g.levelId === found?.levelId);
          setLevelId((cur) => cur ?? current?.levelId ?? null);
          if (!found) setError("Child not found.");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load");
        }
      })();
    }, [id])
  );

  async function saveLevel() {
    if (!levelId) {
      setError("Choose a Learn Wise grade.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<ChildRow>(`/children/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ levelId }),
      });
      await saveActiveChild(updated);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the grade");
    } finally {
      setBusy(false);
    }
  }

  async function saveDevice() {
    if (!device) {
      setError("Choose which phone your child will use.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (device === "this") {
        await apiRequest("/devices/transfer", {
          method: "POST",
          body: JSON.stringify({
            childId: id,
            reason: "Registered during parent setup",
            newInstallationId: await getOrCreateInstallationId(),
            platform: Platform.OS,
            deviceLabel: phoneLabel(),
            appVersion: Constants.expoConfig?.version ?? "0.1.0",
          }),
        });
      }
      const user = await getUser<{ role: string }>();
      const isStaff = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      // Staff practice accounts skip checkout — learning is unlocked without a plan.
      router.replace(isStaff ? "/parent" : "/subscription?setup=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register the phone");
    } finally {
      setBusy(false);
    }
  }

  const name = child?.displayName ?? "your child";

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content}>
            <SoftButton
              label="← Back"
              onPress={() => (step === 3 ? setStep(2) : router.replace("/parent"))}
            />
            <RegistrationSteps step={step} />
            <ErrorText>{error}</ErrorText>

            {step === 2 ? (
              <Card style={{ gap: 12 }}>
                <Title>Learn Wise grade</Title>
                <Text style={styles.meta}>
                  Choose the grade {name} will learn. The age suggestion is only a guide, and
                  changing a birthday never changes the grade. Family accounts need a plan per grade;
                  admin practice accounts can learn without a subscription.
                </Text>
                <GradePicker
                  grades={grades}
                  value={levelId}
                  onChange={(next) => {
                    setLevelId(next);
                    setError(null);
                  }}
                  birthYear={child?.birthYear}
                />
                <PrimaryButton label="Save" onPress={() => void saveLevel()} loading={busy} />
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <Title>Learning phone</Title>
                <Text style={styles.meta}>
                  Each child learns on one registered phone. Which phone will {name} use?
                </Text>
                <Choice
                  title="Child uses this phone"
                  detail={
                    canLockHere
                      ? `Lock ${name} to this phone (${phoneLabel()}) now.`
                      : "Open the Learn Wise app on the child's phone to register it."
                  }
                  selected={device === "this"}
                  disabled={!canLockHere}
                  onPress={() => {
                    setDevice("this");
                    setError(null);
                  }}
                />
                <Choice
                  title="Child will use own phone"
                  detail={`The first phone that opens Learn for ${name} is registered automatically.`}
                  selected={device === "own"}
                  onPress={() => {
                    setDevice("own");
                    setError(null);
                  }}
                />
                <Text style={styles.meta}>
                  You can move {name} to another phone later from Devices.
                </Text>
                <PrimaryButton label="Save" onPress={() => void saveDevice()} loading={busy} />
              </Card>
            )}
          </ScrollView>
        </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

function Choice({
  title,
  detail,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      style={[styles.choice, selected && styles.choiceOn, disabled && styles.choiceOff]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  meta: { color: colors.textMuted, lineHeight: 20 },
  label: { fontWeight: "800", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    backgroundColor: "#fff",
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceOff: { opacity: 0.5 },
  choiceTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
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
