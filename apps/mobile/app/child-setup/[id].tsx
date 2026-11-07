import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, SoftButton, Title } from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { RequireParentGate } from "../../components/RequireParentGate";
import { RegistrationSteps } from "../../components/RegistrationSteps";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import { getOrCreateInstallationId, phoneLabel, saveActiveChild } from "../../services/secure";
import { colors, radii } from "../../theme";

type ChildRow = {
  id: string;
  displayName: string;
  levelId?: string | null;
  gradeId?: string | null;
};
type CatalogLevel = { id: string; code: string; label: string };
type CatalogGrade = { id: string; label: string; assignedLevelId: string | null };
type DeviceChoice = "this" | "own";

export default function ChildSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<2 | 3>(2);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [levels, setLevels] = useState<CatalogLevel[]>([]);
  const [grades, setGrades] = useState<CatalogGrade[]>([]);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLockHere = Platform.OS !== "web";

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const [kids, lv, gr] = await Promise.all([
            apiRequest<ChildRow[]>("/children"),
            apiRequest<CatalogLevel[]>("/parent/catalog/levels").catch(() => []),
            apiRequest<CatalogGrade[]>("/parent/catalog/grades").catch(() => []),
          ]);
          const found = kids.find((k) => k.id === id) ?? null;
          setChild(found);
          setLevels(lv);
          setGrades(gr);
          setLevelId((cur) => cur ?? found?.levelId ?? lv[0]?.id ?? null);
          setGradeId((cur) => cur ?? found?.gradeId ?? null);
          if (!found) setError("Child not found.");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load");
        }
      })();
    }, [id])
  );

  async function saveLevel() {
    if (!levelId) {
      setError("Choose a level.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<ChildRow>(`/children/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ levelId, ...(gradeId ? { gradeId } : {}) }),
      });
      await saveActiveChild(updated);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save level");
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
      router.replace("/subscription?setup=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register the phone");
    } finally {
      setBusy(false);
    }
  }

  const levelGrades = grades.filter((g) => !levelId || g.assignedLevelId === levelId);
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
                <Title>Level & grade</Title>
                <Text style={styles.meta}>What is {name} learning right now?</Text>
                <Text style={styles.label}>Level</Text>
                <View style={styles.chips}>
                  {levels.map((l) => (
                    <SoftButton
                      key={l.id}
                      label={l.label}
                      active={levelId === l.id}
                      onPress={() => {
                        setLevelId(l.id);
                        setGradeId(null);
                      }}
                    />
                  ))}
                </View>
                {!levels.length ? (
                  <Text style={styles.meta}>No levels published yet. Ask Admin to publish levels.</Text>
                ) : null}
                {levelGrades.length ? (
                  <>
                    <Text style={styles.label}>Grade (optional)</Text>
                    <View style={styles.chips}>
                      {levelGrades.map((g) => (
                        <SoftButton
                          key={g.id}
                          label={g.label}
                          active={gradeId === g.id}
                          onPress={() => setGradeId(gradeId === g.id ? null : g.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
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
                      : "Open the LEARN WISE app on the child's phone to register it."
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
