import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { Card, ErrorText, KeyboardScroll, LoadingSlot, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { AdminGradeSelector, useAdminGrade } from "../components/AdminGradeSelector";
import { goAdminBack } from "../services/admin-nav";
import { ADMIN_PRODUCT_GRADES } from "../services/admin-grade";
import { apiDownloadBlob, apiRequest, apiUpload, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import { colors } from "../theme";

type Status = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "UNPUBLISHED";

type Totals = {
  groups: number;
  categories: number;
  categoriesWithWords: number;
  words: number;
  wordsMissingExample: number;
  needsReview: number;
  byStatus: Record<Status, number>;
  publishedPct: number;
  contentPct: number;
};

type LevelInfo = {
  id: string;
  code: string;
  label: string;
  gradeCode: string;
  ageMin: number | null;
  ageMax: number | null;
  locked: boolean;
};

type Topic = {
  id: string;
  code: string;
  label: string;
  emoji: string;
  symbol: string | null;
  dailyConversation: string | null;
  exampleSentence: string | null;
  status: Status;
  isPublished: boolean;
  needsReview: boolean;
  wordCount: number;
  wordsMissingExample: number;
  wordsNotReady: number;
  lessonCount: number;
};

type Summary = {
  level: LevelInfo;
  totals: Totals;
  groups: { id: string; code: string; label: string; isActive: boolean; categories: Topic[] }[];
};

type RowAction = "NEW" | "UPDATE" | "UNCHANGED" | "DUPLICATE" | "ERROR";
type ActionSummary = Record<RowAction, number> & { total: number };
type PreviewRow = {
  row: number;
  action: RowAction;
  categoryCode: string;
  topic?: string;
  word?: string;
  issues: string[];
  warnings: string[];
  changes: string[];
};
type Preview = {
  gradeCode: string;
  locked: boolean;
  canApply: boolean;
  fileIssues: string[];
  errorCount: number;
  topicSummary: ActionSummary;
  wordSummary: ActionSummary;
  topics: PreviewRow[];
  words: PreviewRow[];
};

type PickedFile = { name: string; blob?: Blob; uri?: string; mime: string };

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  UNPUBLISHED: "Unpublished",
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F4F4F5", fg: "#52525B" },
  PENDING_APPROVAL: { bg: "#FEF3C7", fg: "#92400E" },
  APPROVED: { bg: "#DBEAFE", fg: "#1E40AF" },
  PUBLISHED: { bg: "#DCFCE7", fg: "#166534" },
  UNPUBLISHED: { bg: "#FEE2E2", fg: "#991B1B" },
};

/** Buttons offered per status; the server enforces the same transitions. */
const NEXT_ACTIONS: Record<Status, { to: Status; label: string }[]> = {
  DRAFT: [{ to: "PENDING_APPROVAL", label: "Submit for approval" }],
  PENDING_APPROVAL: [
    { to: "APPROVED", label: "Approve" },
    { to: "DRAFT", label: "Send back" },
  ],
  APPROVED: [
    { to: "PUBLISHED", label: "Publish" },
    { to: "DRAFT", label: "Send back" },
  ],
  PUBLISHED: [{ to: "UNPUBLISHED", label: "Unpublish" }],
  UNPUBLISHED: [
    { to: "PUBLISHED", label: "Publish again" },
    { to: "DRAFT", label: "Back to draft" },
  ],
};

const ACTION_COLOR: Record<RowAction, string> = {
  NEW: "#166534",
  UPDATE: "#1E40AF",
  UNCHANGED: "#71717A",
  DUPLICATE: "#B45309",
  ERROR: "#B91C1C",
};

function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_COLOR[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function ActionLine({ label, s }: { label: string; s: ActionSummary }) {
  return (
    <Text style={styles.note}>
      <Text style={{ fontWeight: "800", color: colors.text }}>{label}: </Text>
      {s.total} rows ·{" "}
      {(Object.keys(ACTION_COLOR) as RowAction[]).map((a, i) => (
        <Text key={a} style={{ color: ACTION_COLOR[a], fontWeight: "700" }}>
          {i ? " · " : ""}
          {a} {s[a]}
        </Text>
      ))}
    </Text>
  );
}

export default function AdminCurriculumScreen() {
  const router = useRouter();
  const [grade, setGrade] = useAdminGrade();
  const levelCode = ADMIN_PRODUCT_GRADES.find((g) => g.code === grade)?.levelCode ?? "LEVEL_1";
  const [overview, setOverview] = useState<{ level: LevelInfo; totals: Totals }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<Status | "ALL" | "REVIEW">("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, sum] = await Promise.all([
        apiRequest<{ level: LevelInfo; totals: Totals }[]>("/admin/curriculum/overview"),
        apiRequest<Summary>(`/admin/curriculum/summary?levelCode=${levelCode}`),
      ]);
      setOverview(ov);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the curriculum");
    } finally {
      setLoading(false);
    }
  }, [levelCode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    setPreview(null);
    setPicked(null);
    setInfo(null);
    setExpanded(null);
  }, [levelCode]);

  const locked = summary?.level.locked ?? levelCode === "LEVEL_1";

  const visibleGroups = useMemo(() => {
    if (!summary) return [];
    return summary.groups
      .map((g) => ({
        ...g,
        categories: g.categories.filter((c) =>
          filter === "ALL" ? true : filter === "REVIEW" ? c.needsReview : c.status === filter
        ),
      }))
      .filter((g) => g.categories.length > 0);
  }, [summary, filter]);

  async function changeStatus(topic: Topic, to: Status) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/curriculum/categories/${topic.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: to }),
      });
      setInfo(`${topic.label}: ${STATUS_LABEL[to]}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `${topic.label}: ${err.message}` : "Status change failed");
    } finally {
      setBusy(false);
    }
  }

  const submittableDrafts = (summary?.groups ?? []).flatMap((g) =>
    g.categories.filter((c) => c.status === "DRAFT" && c.wordCount > 0).map((c) => c.id)
  );

  async function bulkStatus(ids: string[], to: Status) {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ updated: number; results: { ok: boolean; error?: string }[] }>(
        "/admin/curriculum/categories/status",
        { method: "POST", body: JSON.stringify({ categoryIds: ids, status: to }) }
      );
      const failed = res.results.filter((r) => !r.ok);
      setInfo(`${res.updated} topic(s) moved to ${STATUS_LABEL[to]}${failed.length ? ` · ${failed.length} refused` : ""}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadWorkbook() {
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS !== "web" || typeof document === "undefined") {
        setInfo("Excel download is available in the web admin. Open Learn Wise admin in a browser to download the workbook.");
        return;
      }
      const blob = await apiDownloadBlob(`/admin/curriculum/export.xlsx?levelCode=${levelCode}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learn-wise-${grade.toLowerCase()}-curriculum.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setInfo("Workbook downloaded (Read Me, Topics, Words). Edit it, then upload it here for a preview.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(): Promise<PickedFile | null> {
    const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = `.xlsx,${xlsxMime}`;
      const file = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });
      return file ? { name: file.name, blob: file, mime: file.type || xlsxMime } : null;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: [xlsxMime, "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return { name: asset.name || "curriculum.xlsx", uri: asset.uri, mime: asset.mimeType || xlsxMime };
  }

  function formFor(file: PickedFile, extra: Record<string, string> = {}) {
    const form = new FormData();
    if (file.blob) form.append("file", file.blob, file.name);
    else if (file.uri) form.append("file", { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
    form.append("levelCode", levelCode);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return form;
  }

  async function uploadForPreview() {
    setError(null);
    setInfo(null);
    const file = await pickFile();
    if (!file) return;
    setBusy(true);
    try {
      const data = await apiUpload<Preview>("/admin/curriculum/import/preview", formFor(file));
      setPicked(file);
      setPreview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!picked || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiUpload<{
        groupsCreated: number;
        topicsCreated: number;
        topicsUpdated: number;
        wordsCreated: number;
        wordsUpdated: number;
        skipped: number;
      }>("/admin/curriculum/import/apply", formFor(picked, preview.errorCount ? { allowPartial: "true" } : {}));
      setInfo(
        `Imported as drafts: ${res.topicsCreated} new topics, ${res.topicsUpdated} updated, ${res.wordsCreated} new words, ${res.wordsUpdated} updated, ${res.skipped} skipped. Nothing was published.`
      );
      setPreview(null);
      setPicked(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const problemRows = useMemo(() => {
    if (!preview) return [];
    return [
      ...preview.topics.map((r) => ({ ...r, kind: "Topic", name: r.topic ?? r.categoryCode })),
      ...preview.words.map((r) => ({ ...r, kind: "Word", name: `${r.word ?? ""} (${r.categoryCode})` })),
    ].filter((r) => r.issues.length || r.warnings.length);
  }, [preview]);

  const t = summary?.totals;

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Curriculum · Grades 1–4</Title>
          <Text style={styles.note}>
            Grade → group → topic → vocabulary. Topics move Draft → Pending approval → Approved → Published. Children only
            see published topics that have words.
          </Text>

          <View style={styles.overviewRow}>
            {overview.map((o) => {
              const active = o.level.code === levelCode;
              const g = ADMIN_PRODUCT_GRADES.find((x) => x.levelCode === o.level.code);
              return (
                <Pressable
                  key={o.level.code}
                  onPress={() => g && setGrade(g.code)}
                  style={[styles.overviewCard, active && styles.overviewCardOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${o.level.label}`}
                >
                  <Text style={styles.overviewTitle}>Grade {g?.number}</Text>
                  <Text style={styles.overviewSub}>Ages {g?.ages}</Text>
                  <Text style={styles.overviewStat}>{o.totals.categories} topics</Text>
                  <Text style={styles.overviewStat}>{o.totals.words} words</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${o.totals.publishedPct}%` }]} />
                  </View>
                  <Text style={styles.overviewSub}>
                    {o.totals.byStatus.PUBLISHED} published · {o.level.locked ? "live, locked" : `${o.totals.needsReview} to review`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <AdminGradeSelector value={grade} onChange={setGrade} />
          <LoadingSlot active={loading || busy} />
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}

          {locked ? (
            <Card color="#FFF7ED">
              <Text style={styles.lockTitle}>Grade 1 is live</Text>
              <Text style={styles.note}>
                Grade 1 content is read-only here: you can download and preview its workbook, but imports and status changes
                are disabled. Edit Grade 1 through the existing vocabulary tools only after separate approval.
              </Text>
            </Card>
          ) : null}

          {summary && t ? (
            <Card>
              <Text style={styles.sectionTitle}>{summary.level.label}</Text>
              <Text style={styles.note}>
                {t.groups} groups · {t.categories} topics · {t.words} words · {t.categoriesWithWords}/{t.categories} topics have
                words ({t.contentPct}%) · {t.byStatus.PUBLISHED} published ({t.publishedPct}%)
                {t.wordsMissingExample ? ` · ${t.wordsMissingExample} words without an example sentence` : ""}
              </Text>
              <View style={styles.chips}>
                <SoftButton label={`All (${t.categories})`} active={filter === "ALL"} onPress={() => setFilter("ALL")} />
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SoftButton
                    key={s}
                    label={`${STATUS_LABEL[s]} (${t.byStatus[s]})`}
                    active={filter === s}
                    onPress={() => setFilter(s)}
                  />
                ))}
                <SoftButton label={`Needs review (${t.needsReview})`} active={filter === "REVIEW"} onPress={() => setFilter("REVIEW")} />
              </View>
              {!locked ? (
                <View style={styles.chips}>
                  {submittableDrafts.length ? (
                    <SoftButton
                      label={`Submit ${submittableDrafts.length} drafts with words`}
                      onPress={() => void bulkStatus(submittableDrafts, "PENDING_APPROVAL")}
                    />
                  ) : null}
                </View>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>Excel workbook</Text>
            <Text style={styles.note}>
              One workbook per grade with sheets Read Me, Topics and Words. Uploading always shows a preview first; applying
              creates or updates drafts only and never publishes.
            </Text>
            <View style={styles.chips}>
              <SoftButton label="⬇ Download Excel" onPress={() => void downloadWorkbook()} />
              <SoftButton label="⬆ Upload Excel for preview" onPress={() => void uploadForPreview()} />
            </View>
          </Card>

          {preview ? (
            <Card>
              <Text style={styles.sectionTitle}>Import preview · {picked?.name}</Text>
              {preview.fileIssues.map((f) => (
                <Text key={f} style={styles.err}>
                  {f}
                </Text>
              ))}
              <ActionLine label="Topics" s={preview.topicSummary} />
              <ActionLine label="Words" s={preview.wordSummary} />
              <Text style={styles.note}>
                {preview.errorCount
                  ? `${preview.errorCount} row(s) have errors and will be skipped.`
                  : "No errors found."}
              </Text>
              {problemRows.slice(0, 60).map((r) => (
                <View key={`${r.kind}-${r.row}`} style={styles.issueRow}>
                  <Text style={[styles.issueHead, { color: ACTION_COLOR[r.action] }]}>
                    {r.kind} row {r.row} · {r.action} · {r.name}
                  </Text>
                  {r.issues.map((m) => (
                    <Text key={m} style={styles.err}>
                      • {m}
                    </Text>
                  ))}
                  {r.warnings.map((m) => (
                    <Text key={m} style={styles.warn}>
                      • {m}
                    </Text>
                  ))}
                </View>
              ))}
              {problemRows.length > 60 ? <Text style={styles.note}>…and {problemRows.length - 60} more.</Text> : null}
              <View style={styles.chips}>
                {preview.canApply ? (
                  <SoftButton
                    label={preview.errorCount ? "Apply valid rows (skip errors)" : "Apply import as drafts"}
                    onPress={() => void applyImport()}
                  />
                ) : (
                  <Text style={styles.note}>{preview.locked ? "Grade 1 is locked — preview only." : "Fix the file issues and upload again."}</Text>
                )}
                <SoftButton
                  label="Cancel"
                  onPress={() => {
                    setPreview(null);
                    setPicked(null);
                  }}
                />
              </View>
            </Card>
          ) : null}

          {visibleGroups.map((g) => (
            <Card key={g.id}>
              <Text style={styles.sectionTitle}>
                {g.label} <Text style={styles.code}>({g.code})</Text>
              </Text>
              {g.categories.map((c) => {
                const open = expanded === c.id;
                return (
                  <View key={c.id} style={styles.topic}>
                    <Pressable onPress={() => setExpanded(open ? null : c.id)} style={styles.topicHead}>
                      <Text style={styles.topicEmoji}>{displayEmoji(c.symbol || c.emoji)}</Text>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.topicLabel}>{c.label}</Text>
                        <Text style={styles.topicMeta}>
                          {c.code} · {c.wordCount} words
                          {c.lessonCount ? ` · ${c.lessonCount} lessons` : ""}
                          {c.wordsNotReady ? ` · ${c.wordsNotReady} not ready` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <StatusBadge status={c.status} />
                        {c.needsReview ? <Text style={styles.review}>Needs review</Text> : null}
                      </View>
                    </Pressable>
                    {open ? (
                      <View style={styles.topicBody}>
                        {c.dailyConversation ? (
                          <Text style={styles.note}>
                            <Text style={styles.bold}>Daily conversation: </Text>
                            {c.dailyConversation}
                          </Text>
                        ) : null}
                        {c.exampleSentence ? (
                          <Text style={styles.note}>
                            <Text style={styles.bold}>Example: </Text>
                            {c.exampleSentence}
                          </Text>
                        ) : null}
                        {c.wordCount === 0 ? (
                          <Text style={styles.warn}>No words yet — this topic cannot be published.</Text>
                        ) : null}
                        <View style={styles.chips}>
                          <SoftButton
                            label="Words"
                            onPress={() => router.push(`/admin-words?grade=${grade}&categoryId=${c.id}` as never)}
                          />
                          {!locked
                            ? NEXT_ACTIONS[c.status].map((a) => (
                                <SoftButton key={a.to} label={a.label} onPress={() => void changeStatus(c, a.to)} />
                              ))
                            : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ))}
          {summary && !visibleGroups.length ? <Text style={styles.note}>No topics match this filter.</Text> : null}
        </KeyboardScroll>
        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  info: { color: colors.success, fontWeight: "700" },
  bold: { fontWeight: "800", color: colors.text },
  err: { color: "#B91C1C", fontSize: 12, lineHeight: 17 },
  warn: { color: "#B45309", fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 4 },
  code: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  overviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  overviewCard: {
    flexGrow: 1,
    flexBasis: 150,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "transparent",
    gap: 2,
  },
  overviewCardOn: { borderColor: colors.primary },
  overviewTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  overviewSub: { fontSize: 12, color: colors.textMuted },
  overviewStat: { fontSize: 13, fontWeight: "700", color: colors.text },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#EDE9FE", marginVertical: 4, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.success },
  lockTitle: { fontWeight: "900", color: "#9A3412", fontSize: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  review: { fontSize: 11, fontWeight: "800", color: "#B45309" },
  topic: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E4E4E7", paddingVertical: 8 },
  topicHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  topicEmoji: { fontSize: 26, width: 34, textAlign: "center" },
  topicLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  topicMeta: { fontSize: 12, color: colors.textMuted },
  topicBody: { paddingLeft: 44, paddingTop: 6, gap: 4 },
  issueRow: { paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F4F4F5" },
  issueHead: { fontSize: 12, fontWeight: "800" },
});
