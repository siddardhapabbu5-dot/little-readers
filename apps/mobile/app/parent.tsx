import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, Field, KeyboardScroll, PrimaryButton, SoftButton } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { ParentBottomNav } from "../components/ParentBottomNav";
import { RequireParentGate } from "../components/RequireParentGate";
import { RegistrationSteps } from "../components/RegistrationSteps";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild, getUser, saveActiveChild } from "../services/secure";
import { colors, radii, shadow } from "../theme";

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
  learnWiseGrade?: { levelCode: string; gradeLabel: string } | null;
};

type GradeAccess = {
  childId: string;
  gradeLabel: string;
  entitled: boolean;
  via: "GRADE" | "LEGACY_FAMILY" | "STAFF" | null;
  expiresAt: string | null;
};

function accessLine(access: GradeAccess | undefined) {
  if (!access) return null;
  const grade = access.gradeLabel.split(" – ")[0];
  const until = access.expiresAt
    ? ` until ${new Date(access.expiresAt).toLocaleDateString()}`
    : "";
  if (access.via === "GRADE") return `${grade} subscription active${until}`;
  if (access.via === "LEGACY_FAMILY") return `Covered by family plan${until}`;
  if (access.via === "STAFF") return "Staff access";
  return `Needs a ${grade} subscription`;
}

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
  const [gradeAccess, setGradeAccess] = useState<Record<string, GradeAccess>>({});
  const [agreementsOutdated, setAgreementsOutdated] = useState(false);
  const [parentName, setParentName] = useState("Parent");
  const [subMeta, setSubMeta] = useState<{
    plan?: string | null;
    status?: string | null;
    expiresAt?: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await getUser<{ name?: string }>();
      if (me?.name) setParentName(me.name.split(" ")[0] || me.name);
      const [kids, sub, access, agreements] = await Promise.all([
        apiRequest<ChildRow[]>("/children"),
        apiRequest<{
          seats?: SeatInfo;
          plan?: string;
          status?: string;
          expiresAt?: string | null;
          subscription?: { plan?: string; status?: string; expiresAt?: string | null };
        }>("/subscriptions/me").catch(() => null),
        apiRequest<GradeAccess[]>("/subscriptions/children").catch(() => []),
        apiRequest<{ allPublished: boolean; allAccepted: boolean; documents: { acceptedAt: string | null }[] }>(
          "/agreements"
        ).catch(() => null),
      ]);
      setChildren(kids);
      setSeats(sub?.seats ?? null);
      setSubMeta({
        plan: sub?.plan ?? sub?.subscription?.plan ?? null,
        status: sub?.status ?? sub?.subscription?.status ?? null,
        expiresAt: sub?.expiresAt ?? sub?.subscription?.expiresAt ?? null,
      });
      setGradeAccess(Object.fromEntries(access.map((a) => [a.childId, a])));
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
      const access = gradeAccess[child.id];
      if (access ? !access.entitled : !child.hasLearningSeat) {
        router.push("/subscription");
        return;
      }
      router.push("/(tabs)/learn");
    });
  }

  const activeChild = children.find((c) => c.id === activeId) ?? children[0] ?? null;
  const activeSummary = activeChild ? progressMap[activeChild.id]?.summary : null;
  const activeAccess = activeChild ? gradeAccess[activeChild.id] : undefined;

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>Hi, {parentName}</Text>
              <Text style={styles.sub}>
                {activeChild
                  ? `Following ${activeChild.displayName}'s learning`
                  : "Children, progress & subscription"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Notifications"
              onPress={() => router.push("/subscription")}
              style={styles.iconBtn}
            >
              <Text style={styles.iconEmoji}>🔔</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Account"
              onPress={() => router.push("/(tabs)/profile")}
              style={styles.iconBtn}
            >
              <Text style={styles.iconEmoji}>👤</Text>
            </Pressable>
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

          <Text style={styles.section}>Your children</Text>
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
            const staffAccess = gradeAccess[child.id]?.via === "STAFF";
            const seated = Boolean(child.hasLearningSeat) || staffAccess;
            const canLearn =
              gradeAccess[child.id]?.entitled === true || Boolean(child.hasLearningSeat);
            const age = Math.max(1, new Date().getFullYear() - child.birthYear);
            return (
              <View
                key={child.id}
                style={[
                  styles.childCard,
                  isActive ? styles.childCardActive : null,
                  shadow.soft,
                ]}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.childIdentity}>
                    <View style={[styles.avatar, isActive && { backgroundColor: colors.primarySoft }]}>
                      <Text style={styles.avatarEmoji}>🧒</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.childName}>{child.displayName}</Text>
                      <Text style={styles.gradeLine}>
                        {child.learnWiseGrade?.gradeLabel ?? "Grade not set"} · Age {age}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {seated ? (
                      <View style={styles.seatBadge}>
                        <Text style={styles.seatBadgeText}>
                          {staffAccess ? "Staff" : "Access"}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.needSeatBadge}>
                        <Text style={styles.needSeatBadgeText}>Locked</Text>
                      </View>
                    )}
                    {isActive ? (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Selected</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.meta}>Birthday {birthday}</Text>
                {gradeAccess[child.id] ? (
                  <Text style={gradeAccess[child.id].entitled ? styles.meta : styles.warn}>
                    {accessLine(gradeAccess[child.id])}
                  </Text>
                ) : null}
                <View style={styles.progressChips}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      📖 {summary?.wordsCorrect ?? summary?.wordsLearned ?? 0} words
                    </Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      ✅ {summary?.categoriesCompleted ?? 0} topics
                    </Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>⭐ {summary?.stars ?? 0}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  Today {summary?.daily?.wordsLearnedToday ?? 0}/
                  {summary?.daily?.target ?? 5} · Accuracy {summary?.accuracy ?? 0}%
                </Text>
                {!canLearn ? (
                  <Text style={styles.warn}>
                    Learning locked until a seat or grade subscription is active for this child.
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <SoftButton
                    label={isActive ? "Selected ✓" : "Select child"}
                    active={isActive}
                    onPress={() => void setActive(child)}
                  />
                  <SoftButton label="View / edit" onPress={() => router.push(`/child/${child.id}`)} />
                  <SoftButton
                    label="Progress"
                    onPress={() => router.push(`/child/${child.id}?tab=progress`)}
                  />
                  <SoftButton
                    label="Challenges"
                    onPress={() => router.push(`/parent-challenges?childId=${child.id}`)}
                  />
                  {!staffAccess ? (
                    <SoftButton
                      label={child.hasLearningSeat ? "Remove seat" : "Assign seat"}
                      onPress={() => void toggleSeat(child)}
                    />
                  ) : null}
                  <SoftButton label="Open Learn" onPress={() => openLearn(child)} />
                </View>
              </View>
            );
          })}

          {activeChild ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Learning progress</Text>
              <Text style={styles.gradeLine}>{activeChild.displayName} only</Text>
              <Text style={styles.meta}>
                Words learned {activeSummary?.wordsCorrect ?? activeSummary?.wordsLearned ?? 0} ·
                Topics {activeSummary?.categoriesCompleted ?? 0} · Stars{" "}
                {activeSummary?.stars ?? 0}
              </Text>
              <Text style={styles.meta}>
                Recent: today {activeSummary?.daily?.wordsLearnedToday ?? 0}/
                {activeSummary?.daily?.target ?? 5} words · week{" "}
                {activeSummary?.weekly?.wordsLearned ?? 0} · need practice{" "}
                {activeSummary?.wordsNeedingPractice ?? 0}
              </Text>
              <SoftButton
                label="Full progress report"
                onPress={() => router.push(`/child/${activeChild.id}?tab=progress`)}
              />
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Subscription</Text>
            {activeChild ? (
              <Text style={styles.meta}>
                Selected child: {activeChild.displayName}
                {activeChild.learnWiseGrade?.gradeLabel
                  ? ` · ${activeChild.learnWiseGrade.gradeLabel}`
                  : ""}
              </Text>
            ) : null}
            <Text style={styles.meta}>
              Plan {subMeta?.plan ?? "—"} · Status {subMeta?.status ?? "—"}
              {subMeta?.expiresAt
                ? ` · Expires ${new Date(subMeta.expiresAt).toLocaleDateString()}`
                : ""}
            </Text>
            {activeAccess ? (
              <Text style={activeAccess.entitled ? styles.meta : styles.warn}>
                {accessLine(activeAccess)}
              </Text>
            ) : null}
            {seats ? (
              <Text style={styles.meta}>
                Seats {seats.assigned}/{seats.capacity} used · {seats.included} included
                {seats.extra ? ` · ${seats.extra} add-on` : ""}
              </Text>
            ) : null}
            <PrimaryButton
              label={activeAccess?.entitled ? "Manage plan" : "Renew / activate"}
              onPress={() => router.push("/subscription")}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <RegistrationSteps step={1} />
            <Text style={styles.section}>Add child</Text>
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
              Birthday must be DD/MM/YYYY. Next you'll choose the grade and learning phone.
            </Text>
            <PrimaryButton label="Add child" onPress={() => void addChild()} loading={busy} />
          </Card>

          <View style={{ height: 12 }} />
        </KeyboardScroll>
        <ParentBottomNav activeChildId={activeId} />
      </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  hello: { fontSize: 24, fontWeight: "900", color: colors.text },
  sub: { color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconEmoji: { fontSize: 18 },
  warn: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  childCard: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childCardActive: {
    borderColor: colors.primary,
    backgroundColor: "#FFFEFF",
  },
  childIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 24 },
  progressChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: colors.bgSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  chipText: { fontWeight: "800", fontSize: 12, color: colors.text },
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
  section: { fontWeight: "800", fontSize: 18, color: colors.text },
  childName: { fontWeight: "800", fontSize: 18, color: colors.text },
  gradeLine: { fontWeight: "800", color: colors.primary, fontSize: 13 },
  meta: { color: colors.textMuted, fontWeight: "600", lineHeight: 18 },
  info: { color: colors.success, fontWeight: "700" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    color: colors.mintDeep,
    fontWeight: "800",
    fontSize: 12,
  },
});
