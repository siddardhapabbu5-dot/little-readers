import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Card, ErrorText, PrimaryButton, ProgressBar, SoftButton } from "./ui";
import { apiRequest, ApiError } from "../services/api";
import { MEDALS, formatCountdown, weekOf } from "../services/challenges";
import { colors, radii } from "../theme";

type BadgeDef = { key: string; title: string; emoji: string };
type BoardRow = {
  childId: string;
  displayName: string;
  rank: number;
  points: number;
  goalPct: number;
  badges: BadgeDef[];
};
type TeacherChallenges = {
  enabled: boolean;
  endsAt: string;
  students: { childId: string; displayName: string }[];
  current: { id: string; title: string; goalPoints: number; childIds: string[]; board: BoardRow[] } | null;
  history: {
    id: string;
    title: string;
    weekStart: string;
    goalPoints: number;
    participants: number;
    goalReached: number;
    top: { displayName: string; points: number; rank: number }[];
  }[];
  badgeCatalog: (BadgeDef & { description: string })[];
};

/** Teacher: weekly classroom challenge for selected enrolled students. */
export function ClassroomChallengePanel({ classroomId }: { classroomId: string }) {
  const [data, setData] = useState<TeacherChallenges | null>(null);
  const [title, setTitle] = useState("Weekly Reading Challenge");
  const [goal, setGoal] = useState("100");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [awardFor, setAwardFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await apiRequest<TeacherChallenges>(`/challenges/teacher/classrooms/${classroomId}`);
    setData(d);
    if (d.current) {
      setTitle(d.current.title);
      setGoal(String(d.current.goalPoints));
      setPicked(new Set(d.current.childIds));
    } else {
      setPicked(new Set(d.students.map((s) => s.childId)));
    }
  }, [classroomId]);

  useEffect(() => {
    setEditing(false);
    setAwardFor(null);
    setInfo(null);
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load challenge"));
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/challenges/teacher/classrooms/${classroomId}`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), goalPoints: Number(goal) || 100, childIds: [...picked] }),
      });
      setEditing(false);
      setInfo(data?.current ? "Challenge updated" : "This week's challenge has started!");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save challenge");
    } finally {
      setBusy(false);
    }
  }

  async function award(childId: string, badge: string) {
    if (!data?.current) return;
    setError(null);
    try {
      const r = await apiRequest<{ awarded: boolean; badge: BadgeDef }>(
        `/challenges/teacher/classrooms/${classroomId}/${data.current.id}/badges`,
        { method: "POST", body: JSON.stringify({ childId, badge }) }
      );
      setInfo(r.awarded ? `${r.badge.emoji} ${r.badge.title} awarded` : "Already awarded");
      setAwardFor(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not award badge");
    }
  }

  if (!data) return error ? <ErrorText>{error}</ErrorText> : null;
  if (!data.enabled) {
    return (
      <Card style={{ gap: 6 }}>
        <Text style={styles.section}>🏆 Classroom challenge</Text>
        <Text style={styles.item}>Classroom challenges are switched off by the administrator.</Text>
      </Card>
    );
  }

  const showForm = !data.current || editing;

  return (
    <Card style={{ gap: 10 }} color="#F5F3FF">
      <Text style={styles.section}>🏆 Weekly classroom challenge</Text>
      <Text style={styles.hint}>
        Only enrolled students can join. Rankings are visible to you and the children in the challenge — no
        global opt-in needed. Week ends in {formatCountdown(new Date(data.endsAt).getTime() - Date.now())}.
      </Text>
      <ErrorText>{error}</ErrorText>
      {info ? <Text style={styles.info}>{info}</Text> : null}

      {showForm ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Challenge name</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={60} style={styles.input} />
          <Text style={styles.label}>Weekly goal (points per child)</Text>
          <TextInput value={goal} onChangeText={setGoal} keyboardType="number-pad" maxLength={4} style={styles.input} />
          <Text style={styles.label}>Students ({picked.size} selected)</Text>
          <View style={styles.chips}>
            {data.students.map((s) => {
              const on = picked.has(s.childId);
              return (
                <Pressable
                  key={s.childId}
                  onPress={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(s.childId);
                      else next.add(s.childId);
                      return next;
                    })
                  }
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {on ? "✓ " : ""}
                    {s.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!data.students.length ? <Text style={styles.item}>Enroll students first.</Text> : null}
          <PrimaryButton
            label={data.current ? "Save changes" : "Start this week's challenge"}
            loading={busy}
            disabled={!picked.size || title.trim().length < 3}
            onPress={() => void save()}
          />
          {data.current ? <SoftButton label="Cancel" onPress={() => setEditing(false)} /> : null}
        </View>
      ) : data.current ? (
        <View style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>
              {data.current.title} · goal {data.current.goalPoints} pts
            </Text>
            <SoftButton label="Edit" onPress={() => setEditing(true)} />
          </View>
          {data.current.board.map((b) => (
            <View key={b.childId} style={styles.boardRow}>
              <View style={styles.rowBetween}>
                <Text style={styles.item}>
                  {b.rank <= 3 && b.points > 0 ? MEDALS[b.rank - 1] : `#${b.rank}`} {b.displayName}{" "}
                  {b.badges.map((x) => x.emoji).join("")}
                </Text>
                <Text style={styles.points}>{b.points} pts</Text>
              </View>
              <ProgressBar value={b.goalPct} max={100} color={b.goalPct >= 100 ? colors.mint : colors.primary} />
              <Pressable onPress={() => setAwardFor(awardFor === b.childId ? null : b.childId)}>
                <Text style={styles.link}>{awardFor === b.childId ? "Close" : "🎖️ Award a badge"}</Text>
              </Pressable>
              {awardFor === b.childId ? (
                <View style={styles.chips}>
                  {data.badgeCatalog.map((d) => (
                    <Pressable key={d.key} onPress={() => void award(b.childId, d.key)} style={styles.chip}>
                      <Text style={styles.chipText}>
                        {d.emoji} {d.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {data.history.length ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Previous weeks</Text>
          {data.history.map((h) => (
            <Text key={h.id} style={styles.item}>
              Week of {weekOf(h.weekStart)} · {h.title}: {h.goalReached}/{h.participants} reached the goal
              {h.top[0] && h.top[0].points > 0 ? ` · 🥇 ${h.top[0].displayName}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { fontWeight: "900", fontSize: 17, color: colors.text },
  title: { fontWeight: "800", fontSize: 15, color: colors.text, flexShrink: 1 },
  label: { fontWeight: "800", color: colors.text },
  item: { color: colors.text, fontWeight: "600", flexShrink: 1 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  info: { color: colors.mintDeep, fontWeight: "700" },
  points: { fontWeight: "900", color: colors.primaryDark },
  link: { color: colors.primaryDark, fontWeight: "800", fontSize: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  boardRow: { backgroundColor: "#fff", borderRadius: radii.sm, padding: 10, gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontWeight: "700",
    color: colors.text,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: "700", color: colors.text },
  chipTextOn: { color: "#fff" },
});
