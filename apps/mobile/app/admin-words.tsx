import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminTabBar } from "../components/AdminTabBar";
import { Card, ErrorText, KeyboardScroll, SoftButton, Title, LoadingSlot } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { goAdminBack } from "../services/admin-nav";
import {
  apiDownloadText,
  apiRequest,
  apiUpload,
  ApiError,
} from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import { AdminActivityPanel } from "../components/AdminActivityPanel";
import { ReadinessPanel } from "../components/ReadinessPanel";
import { AdminGradeSelector, useAdminGrade } from "../components/AdminGradeSelector";
import { ADMIN_PRODUCT_GRADES } from "../services/admin-grade";
import { colors } from "../theme";

type GradeRow = { id: string; code: string; label: string };
type FailedCategory = { category: string; count: number; reasons: string[] };

type Category = {
  id: string;
  label: string;
  draftWordCount?: number;
  _count?: { words?: number };
  group?: {
    code?: string;
    level?: { code?: string; grade?: { code?: string } | null };
  };
};

type WordRow = {
  id: string;
  text: string;
  meaning: string;
  phonetic: string | null;
  emoji: string;
  difficulty: number;
  isActive: boolean;
  origin: string;
  categoryId: string;
  category: {
    id: string;
    label: string;
    group: {
      label: string;
      level: {
        label: string;
        grade: { code: string; label: string } | null;
      };
    };
  };
  dictionarySense?: {
    definition: string;
    entry?: {
      headword: string;
      sourceName: string | null;
      licence: string | null;
      pronunciation: string | null;
    };
  } | null;
};

type WordList = { total: number; words: WordRow[] };

type Assignment = {
  id: string;
  confidenceScore: number;
  grade: { code: string };
  category: { label: string };
  sense: { definition: string; entry: { headword: string } };
};

export default function AdminWordsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    grade?: string | string[];
    categoryId?: string | string[];
  }>();
  const paramGrade = Array.isArray(params.grade) ? params.grade[0] : params.grade;
  const paramCategoryId = Array.isArray(params.categoryId)
    ? params.categoryId[0]
    : params.categoryId;
  const [q, setQ] = useState("");
  const [grade, setSharedGrade] = useAdminGrade();
  const setGrade = setSharedGrade;
  const [gradeRows, setGradeRows] = useState<GradeRow[]>([]);
  const [categoryId, setCategoryId] = useState<string>(paramCategoryId || "");
  /** Default "all" so inactive draft imports are visible in Admin. */
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [words, setWords] = useState<WordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pending, setPending] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<WordRow | null>(null);
  const [edit, setEdit] = useState({
    text: "",
    meaning: "",
    phonetic: "",
    emoji: "",
    difficulty: "1",
  });
  const [reclassCategoryId, setReclassCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [uploadFailures, setUploadFailures] = useState<FailedCategory[]>([]);
  const [skippedTabs, setSkippedTabs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const gradeId = useMemo(
    () => gradeRows.find((g) => g.code === grade)?.id ?? "",
    [gradeRows, grade]
  );

  const gradeCategories = useMemo(
    () =>
      categories.filter((c) => c.group?.level?.grade?.code === grade),
    [categories, grade]
  );
  const selectedCategory = gradeCategories.find((c) => c.id === categoryId) ?? null;

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [grades, cats] = await Promise.all([
        apiRequest<GradeRow[]>("/admin/content/grades"),
        apiRequest<Category[]>("/admin/content/categories"),
      ]);
      setGradeRows(grades);
      setCategories(cats);
      const gid = grades.find((g) => g.code === grade)?.id;
      const params = new URLSearchParams({ take: "500" });
      if (activeFilter !== "all") params.set("isActive", activeFilter);
      if (q.trim()) params.set("q", q.trim());
      if (gid) params.set("gradeId", gid);
      if (categoryId) params.set("categoryId", categoryId);
      const [list, pend] = await Promise.all([
        apiRequest<WordList>(`/admin/vocabulary/words?${params}`),
        apiRequest<Assignment[]>(
          "/admin/dictionary/assignments?status=PENDING&take=80"
        ).catch(() => [] as Assignment[]),
      ]);
      setWords(list.words);
      setTotal(list.total);
      setPending(
        pend.filter((a) => !grade || a.grade.code === grade).slice(0, 40)
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [q, grade, categoryId, activeFilter]);

  useEffect(() => {
    if (paramGrade) setGrade(paramGrade);
    if (paramCategoryId !== undefined) setCategoryId(paramCategoryId || "");
  }, [paramGrade, paramCategoryId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function openWord(w: WordRow) {
    setSelected(w);
    setEdit({
      text: w.text,
      meaning: w.meaning,
      phonetic: w.phonetic ?? "",
      emoji: w.emoji,
      difficulty: String(w.difficulty),
    });
    setReclassCategoryId(w.categoryId);
    setInfo(null);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          text: edit.text,
          meaning: edit.meaning,
          phonetic: edit.phonetic || null,
          emoji: edit.emoji,
          difficulty: Number(edit.difficulty) || 1,
        }),
      });
      setInfo("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}/deactivate`, {
        method: "POST",
        body: "{}",
      });
      setInfo("Deactivated.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      setInfo("Activated (still only visible to kids if the topic is published).");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Activate failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ format: "auto" });
      if (activeFilter !== "all") params.set("isActive", activeFilter);
      if (gradeId) params.set("gradeId", gradeId);
      if (categoryId) params.set("categoryId", categoryId);
      let csv = await apiDownloadText(
        `/admin/vocabulary/words/export.csv?${params}`
      );
      // Keep Excel emoji-safe even if an older API omitted the BOM.
      if (!csv.startsWith("\uFEFF")) csv = `\uFEFF${csv}`;
      const isAz = csv.includes("Capital Letter") && csv.includes("Symbol");
      const catLabel =
        gradeCategories.find((c) => c.id === categoryId)?.label ?? "category";
      const safe = catLabel.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
      const name = isAz
        ? `${safe || "ABC-Learning"}-A-to-Z.csv`
        : `learn-wise-${grade}${categoryId ? `-${safe}` : ""}.csv`;
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        setInfo(
          isAz
            ? `Downloaded live A–Z sheet (${name}) with visible emoji symbols.`
            : `Downloaded ${name}. Edit in Excel, then Upload sheet.`
        );
      } else {
        await Share.share({ message: csv, title: name });
        setInfo("CSV shared — save the file, edit, then Upload sheet.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCsv() {
    setBusy(true);
    setError(null);
    setUploadFailures([]);
    setSkippedTabs([]);
    try {
      let fileName = "sheet.csv";
      let fileBlob: Blob | null = null;
      let fileUri: string | null = null;
      let mime = "application/octet-stream";

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept =
          ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
        const file = await new Promise<File | null>((resolve) => {
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        });
        if (!file) {
          setInfo("Upload cancelled.");
          return;
        }
        fileName = file.name;
        fileBlob = file;
        mime = file.type || mime;
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            "text/csv",
            "text/plain",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "*/*",
          ],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets?.[0]) {
          setInfo("Upload cancelled.");
          return;
        }
        const asset = result.assets[0];
        fileName = asset.name || "sheet.xlsx";
        fileUri = asset.uri;
        mime = asset.mimeType || mime;
      }

      // XLSX may contain multiple A–Z tabs (Alphabet, Fruits, …).
      // With a category selected → matching tab; without → each tab maps by name.

      const form = new FormData();
      if (fileBlob) {
        form.append("file", fileBlob, fileName);
      } else if (fileUri) {
        form.append("file", {
          uri: fileUri,
          name: fileName,
          type: mime,
        } as unknown as Blob);
      }
      if (categoryId) form.append("categoryId", categoryId);
      const levelCode = ADMIN_PRODUCT_GRADES.find((g) => g.code === grade)?.levelCode;
      if (levelCode) form.append("levelCode", levelCode);

      const data = await apiUpload<{
        created: number;
        updated: number;
        failed: number;
        format?: string;
        sheet?: string;
        sheetsImported?: string[];
        skippedSheets?: string[];
        failedByCategory?: FailedCategory[];
      }>("/admin/vocabulary/words/import-sheet", form);
      setUploadFailures(data.failedByCategory ?? []);
      setSkippedTabs(data.skippedSheets ?? []);
      const sheetNote = data.sheet
        ? ` · ${data.sheet}`
        : data.sheetsImported?.length
          ? ` · ${data.sheetsImported.join("; ")}`
          : "";
      setInfo(
        `Sheet imported${data.format?.startsWith("alphabet") ? " (A–Z)" : ""}${sheetNote}: ${data.created} created, ${data.updated} updated, ${data.failed} failed.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function reclassify() {
    if (!selected || !reclassCategoryId) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/vocabulary/words/${selected.id}/reclassify`, {
        method: "POST",
        body: JSON.stringify({ categoryId: reclassCategoryId }),
      });
      setInfo("Reclassified.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reclassify failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkPending(action: "approve" | "publish") {
    if (!pending.length) return;
    setBusy(true);
    try {
      const ids = pending.map((p) => p.id);
      const path =
        action === "approve"
          ? "/admin/dictionary/assignments/bulk-approve"
          : "/admin/dictionary/assignments/bulk-publish";
      const data = await apiRequest<{ updated: number; failed: number }>(path, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      setInfo(
        `${action}: ${data.updated} ok` +
          (data.failed ? `, ${data.failed} failed` : "")
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Bulk ${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => goAdminBack(router)} />
          <Title>Vocabulary Manager</Title>
          <Text style={styles.note}>
            One Excel for all categories: tabs like A-Z Alphabet, A-Z Fruits (same columns).
            Select the category chip (e.g. Fruits), then Upload sheet — matching tab is imported.
            Or upload with no chip to fill every matching tab. AI never auto-publishes.
          </Text>
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}
          {uploadFailures.length || skippedTabs.length ? (
            <View style={styles.failBox}>
              <Text style={styles.failTitle}>Not uploaded — please fix and upload again</Text>
              {uploadFailures.map((f) => (
                <View key={f.category} style={styles.failRow}>
                  <Text style={styles.failCat}>
                    {f.category}: {f.count} failed
                  </Text>
                  {f.reasons.map((r) => (
                    <Text key={r} style={styles.failReason}>
                      • {r}
                    </Text>
                  ))}
                </View>
              ))}
              {skippedTabs.map((t) => (
                <Text key={t} style={styles.failCat}>
                  Tab "{t}": skipped (no matching category or no words)
                </Text>
              ))}
            </View>
          ) : null}
          <LoadingSlot active={busy} />

          <Card style={{ gap: 8 }}>
            <AdminGradeSelector
              value={grade}
              onChange={(g) => {
                setGrade(g);
                setCategoryId("");
              }}
            />
            <Text style={styles.section}>Category (saves scrolling)</Text>
            <View style={styles.rowWrap}>
              <SoftButton
                label="All categories"
                active={!categoryId}
                onPress={() => setCategoryId("")}
              />
              {gradeCategories.map((c) => {
                const activeN = c._count?.words ?? 0;
                const draftN = c.draftWordCount ?? 0;
                const totalN = activeN + draftN;
                const countLabel =
                  draftN > 0
                    ? ` (${totalN} · ${draftN} draft)`
                    : activeN
                      ? ` (${activeN})`
                      : "";
                return (
                  <SoftButton
                    key={c.id}
                    label={`${c.label}${countLabel}`}
                    active={categoryId === c.id}
                    onPress={() => setCategoryId(c.id)}
                  />
                );
              })}
            </View>
            <Text style={styles.section}>Show words</Text>
            <View style={styles.rowWrap}>
              <SoftButton
                label="All"
                active={activeFilter === "all"}
                onPress={() => setActiveFilter("all")}
              />
              <SoftButton
                label="Active only"
                active={activeFilter === "true"}
                onPress={() => setActiveFilter("true")}
              />
              <SoftButton
                label="Drafts only"
                active={activeFilter === "false"}
                onPress={() => setActiveFilter("false")}
              />
            </View>
            <AdminActivityPanel category={selectedCategory} />
            <ReadinessPanel grade={grade} />
            <TextInput
              style={styles.input}
              placeholder="Search word or meaning"
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
            />
            <SoftButton label="Search / refresh" onPress={() => void load()} />
            <View style={styles.rowWrap}>
              <SoftButton label="Download CSV" onPress={() => void downloadCsv()} />
              <SoftButton label="Upload sheet" onPress={() => void uploadCsv()} />
              <SoftButton
                label="Dictionary upload"
                onPress={() => router.push("/admin-dictionary" as never)}
              />
            </View>
            <Text style={styles.meta}>
              Showing {words.length} of {total}{" "}
              {activeFilter === "false"
                ? "draft"
                : activeFilter === "true"
                  ? "active"
                  : ""}{" "}
              words
              {categoryId ? " in this category" : ` for ${grade}`}.
              Drafts stay hidden from kids until you activate them.
              A–Z template: docs/templates/A_to_Z_Alphabet_with_Symbols.xlsx
              (select category first). Grade/level CSV:
              docs/templates/little-readers-words-by-grade-level-template.csv
            </Text>
          </Card>

          {pending.length ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>
                Pending AI suggestions ({pending.length})
              </Text>
              <View style={styles.rowWrap}>
                <SoftButton label="Approve all" onPress={() => void bulkPending("approve")} />
                <SoftButton label="Publish all" onPress={() => void bulkPending("publish")} />
              </View>
              {pending.slice(0, 12).map((a) => (
                <Text key={a.id} style={styles.meta}>
                  {a.sense.entry.headword} → {a.grade.code} · {a.category.label}
                </Text>
              ))}
            </Card>
          ) : null}

          {words.map((w) => (
            <Card key={w.id} style={{ gap: 4 }}>
              <Text style={styles.word}>
                {displayEmoji(w.emoji, "")}
                {displayEmoji(w.emoji, "") ? " " : ""}
                {w.text}
                {!w.isActive ? " · draft" : ""}
              </Text>
              <Text style={styles.meta}>
                {w.category.group.level.grade?.code} · {w.category.label} · {w.origin}
                {w.isActive ? " · active" : " · inactive"}
              </Text>
              <Text style={styles.meta} numberOfLines={2}>
                {w.meaning}
              </Text>
              <SoftButton label="Open" onPress={() => openWord(w)} />
            </Card>
          ))}

          {selected ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.section}>Edit · {selected.text}</Text>
              {selected.dictionarySense ? (
                <Text style={styles.meta}>
                  Dictionary: {selected.dictionarySense.definition}
                  {selected.dictionarySense.entry?.sourceName
                    ? ` · source ${selected.dictionarySense.entry.sourceName}`
                    : ""}
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                value={edit.text}
                onChangeText={(text) => setEdit({ ...edit, text })}
              />
              <TextInput
                style={[styles.input, { minHeight: 70 }]}
                multiline
                value={edit.meaning}
                onChangeText={(meaning) => setEdit({ ...edit, meaning })}
                placeholder="Child-friendly meaning"
              />
              <TextInput
                style={styles.input}
                value={edit.phonetic}
                onChangeText={(phonetic) => setEdit({ ...edit, phonetic })}
                placeholder="Phonetic"
              />
              <Text style={styles.meta}>Move to category (same grade)</Text>
              <View style={styles.rowWrap}>
                {gradeCategories.slice(0, 12).map((c) => (
                  <SoftButton
                    key={c.id}
                    label={c.label}
                    active={reclassCategoryId === c.id}
                    onPress={() => setReclassCategoryId(c.id)}
                  />
                ))}
              </View>
              <SoftButton label="Save" onPress={() => void save()} />
              <SoftButton label="Reclassify" onPress={() => void reclassify()} />
              {selected.isActive ? (
                <SoftButton label="Deactivate" onPress={() => void deactivate()} />
              ) : (
                <SoftButton label="Activate draft" onPress={() => void activate()} />
              )}
              <SoftButton label="Close" onPress={() => setSelected(null)} />
            </Card>
          ) : null}
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
  failBox: {
    backgroundColor: "#FEE2E2",
    borderColor: colors.danger,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  failTitle: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  failRow: { gap: 2 },
  failCat: { color: "#991B1B", fontWeight: "800" },
  failReason: { color: "#7F1D1D", fontSize: 13 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  word: { fontWeight: "800", fontSize: 17, color: colors.text },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#fff",
  },
});
