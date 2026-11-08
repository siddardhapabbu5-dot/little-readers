import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  Title,
} from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { RegistrationSteps } from "../components/RegistrationSteps";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild, saveActiveChild } from "../services/secure";
import { colors } from "../theme";

type ChildRow = {
  id: string;
  displayName: string;
  birthYear: number;
  birthDate?: string | null;
  level: string;
  levelId?: string | null;
  gradeId?: string | null;
  grade?: { id: string; label: string; gradeNumber: number | null } | null;
  hasLearningSeat?: boolean;
};

type CatalogLevel = { id: string; code: string; label: string };

type SeatInfo = {
  included: number;
  extra: number;
  capacity: number;
  assigned: number;
  available: number;
};

function formatBirthdayInput(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function ParentScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seats, setSeats] = useState<SeatInfo | null>(null);
  const [catalogLevels, setCatalogLevels] = useState<CatalogLevel[]>([]);
  const [agreementsOutdated, setAgreementsOutdated] = useState(false);

  const load = useCallback(async () => {
    try {
      const [kids, sub, levels, agreements] = await Promise.all([
        apiRequest<ChildRow[]>("/children"),
        apiRequest<{ seats?: SeatInfo }>("/subscriptions/me").catch(() => null),
        apiRequest<CatalogLevel[]>("/parent/catalog/levels").catch(() => []),
        apiRequest<{ allPublished: boolean; allAccepted: boolean; documents: { acceptedAt: string | null }[] }>(
          "/agreements"
        ).catch(() => null),
      ]);
      setChildren(kids);
      setSeats(sub?.seats ?? null);
      setCatalogLevels(levels);
      setAgreementsOutdated(
        Boolean(
          agreements?.allPublished &&
            !agreements.allAccepted &&
            agreements.documents.some((d) => d.acceptedAt)
        )
      );
      const active = await getActiveChild<{ id: string }>();
      setActiveId(active?.id ?? kids[0]?.id ?? null);
      if (!active && kids[0]) {
        await saveActiveChild(kids[0]);
        setActiveId(kids[0].id);
      }
      const entries = await Promise.all(
        kids.map(async (k) => {
          try {
            const p = await apiRequest(`/learning/progress/${k.id}`);
            return [k.id, p] as const;
          } catch {
            return [k.id, null] as const;
          }
        })
      );
      setProgressMap(Object.fromEntries(entries));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function setActive(child: ChildRow) {
    setError(null);
    await saveActiveChild(child);
    setActiveId(child.id);
    setInfo(`${child.displayName} is now the active learner.`);
  }

  async function addChild() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiRequest<ChildRow>("/children", {
        method: "POST",
        body: JSON.stringify({
          displayName: name.trim(),
          birthDate: birthDate.trim(),
          ...(catalogLevels[0] ? { levelId: catalogLevels[0].id } : {}),
        }),
      });
      setName("");
      setBirthDate("");
      await saveActiveChild(created);
      setActiveId(created.id);
      router.push(`/child-setup/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add child");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSeat(child: ChildRow) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (child.hasLearningSeat) {
        await apiRequest("/subscriptions/seats/unassign", {
          method: "POST",
          body: JSON.stringify({ childId: child.id }),
        });
        setInfo(`Learning seat removed from ${child.displayName}.`);
      } else {
        await apiRequest("/subscriptions/seats/assign", {
          method: "POST",
          body: JSON.stringify({ childId: child.id }),
        });
        setInfo(`Learning seat assigned to ${child.displayName}.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Seat update failed");
    } finally {
      setBusy(false);
    }
  }

  function openLearn(child: ChildRow) {
    void setActive(child).then(() => {
      if (!child.hasLearningSeat) {
        router.push("/subscription");
        return;
      }
      router.push("/(tabs)/learn");
    });
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton
            label="← Back"
            onPress={() => {
              // After login, Parent lands here via replace — no history to pop.
              if (router.canGoBack()) {
                router.back();
                return;
              }
              router.replace("/(tabs)/home");
            }}
          />
          <Title>Parent dashboard</Title>
          <Text style={styles.sub}>Children, progress, devices & subscription</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <SoftButton label="Devices" onPress={() => router.push("/devices")} />
            <SoftButton label="Subscription" onPress={() => router.push("/subscription")} />
            <SoftButton
              label="Privacy requests"
              onPress={() => router.push("/privacy-request")}
            />
          </View>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}

          {agreementsOutdated ? (
            <Card style={{ gap: 8, borderColor: colors.danger, borderWidth: 1 }}>
              <Text style={styles.section}>Updated agreements</Text>
              <Text style={styles.meta}>
                Learn Wise updated its terms. Please review and accept them to keep using
                subscriptions and payments.
              </Text>
              <PrimaryButton label="Review agreements" onPress={() => router.push("/agreements")} />
            </Card>
          ) : null}

          {seats ? (
            <Card style={{ gap: 6 }}>
              <Text style={styles.section}>Child seats</Text>
              <Text style={styles.meta}>
                {seats.assigned}/{seats.capacity} seats used · {seats.included} included
                {seats.extra ? ` · ${seats.extra} add-on` : ""}
              </Text>
              <Text style={styles.meta}>
                Base plan covers {seats.included} child
                {seats.included === 1 ? "" : "ren"}. Extra seats need purchase or admin
                activation.
              </Text>
            </Card>
          ) : null}

          <Text style={styles.section}>My Children</Text>
          {!children.length ? (
            <Card>
              <Text style={styles.meta}>
                No children yet. Add a child below to start learning.
              </Text>
            </Card>
          ) : null}
          {children.map((child) => {
            const summary = progressMap[child.id]?.summary;
            const isActive = activeId === child.id;
            const birthday = child.birthDate ?? `01/01/${child.birthYear}`;
            const seated = Boolean(child.hasLearningSeat);
            return (
              <Card key={child.id} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.childName}>{child.displayName}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {seated ? (
                      <View style={styles.seatBadge}>
                        <Text style={styles.seatBadgeText}>Seat</Text>
                      </View>
                    ) : (
                      <View style={styles.needSeatBadge}>
                        <Text style={styles.needSeatBadgeText}>Needs seat</Text>
                      </View>
                    )}
                    {isActive ? (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.meta}>
                  {child.level}
                  {child.grade ? ` · ${child.grade.label}` : ""} · Birthday {birthday}
                </Text>
                <Text style={styles.meta}>
                  Words correct {summary?.wordsCorrect ?? summary?.wordsLearned ?? 0} · Tried{" "}
                  {summary?.wordsAttempted ?? "—"} · Accuracy {summary?.accuracy ?? 0}%
                </Text>
                <Text style={styles.meta}>
                  Today {summary?.daily?.wordsLearnedToday ?? 0}/
                  {summary?.daily?.target ?? 5} · Week {summary?.weekly?.wordsLearned ?? 0} ·
                  Stars {summary?.stars ?? 0} · Points {summary?.points ?? 0}
                </Text>
                <Text style={styles.meta}>
                  Activities {summary?.activitiesCompleted ?? 0} · Need practice{" "}
                  {summary?.wordsNeedingPractice ?? 0} · Categories{" "}
                  {summary?.categoriesCompleted ?? 0}
                </Text>
                {!seated ? (
                  <Text style={styles.warn}>
                    Kids Zone locked until a learning seat is assigned.
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  <SoftButton
                    label="View / edit"
                    onPress={() => router.push(`/child/${child.id}`)}
                  />
                  <SoftButton
                    label="Progress report"
                    onPress={() => router.push(`/child/${child.id}?tab=progress`)}
                  />
                  <SoftButton
                    label="🏆 Challenge settings"
                    onPress={() => router.push(`/parent-challenges?childId=${child.id}`)}
                  />
                  <SoftButton
                    label={isActive ? "Active ✓" : "Set active"}
                    active={isActive}
                    onPress={() => void setActive(child)}
                  />
                  <SoftButton
                    label={seated ? "Remove seat" : "Assign seat"}
                    onPress={() => void toggleSeat(child)}
                  />
                  <SoftButton
                    label={seated ? "Learn" : "Activate seat"}
                    onPress={() => openLearn(child)}
                  />
                </View>
              </Card>
            );
          })}

          <Card style={{ gap: 10 }}>
            <RegistrationSteps step={1} />
            <Text style={styles.section}>Add Child</Text>
            <Field label="Display name" value={name} onChangeText={setName} />
            <Field
              label="Birthday (DD/MM/YYYY)"
              keyboardType="number-pad"
              placeholder="15/03/2021"
              value={birthDate}
              onChangeText={(v) => setBirthDate(formatBirthdayInput(v))}
              maxLength={10}
            />
            <Text style={styles.meta}>
              Next you'll choose the level, the learning phone and a subscription.
            </Text>
            <PrimaryButton label="Save child" onPress={() => void addChild()} loading={busy} />
          </Card>

          <PrimaryButton
            label="Subscription status"
            onPress={() => router.push("/subscription")}
          />
          <SoftButton
            label="Device registration / transfer"
            onPress={() => router.push("/devices")}
          />
        </ScrollView>
      </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  warn: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  seatBadge: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  seatBadgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  needSeatBadge: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  needSeatBadgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  sub: { color: colors.textMuted },
  section: { fontWeight: "800", fontSize: 18, color: colors.text },
  childName: { fontWeight: "800", fontSize: 18, color: colors.text },
  meta: { color: colors.textMuted },
  info: { color: colors.success, fontWeight: "700" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  activeBadge: {
    backgroundColor: colors.mintSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeBadgeText: {
    color: colors.success,
    fontWeight: "800",
    fontSize: 12,
  },
});
