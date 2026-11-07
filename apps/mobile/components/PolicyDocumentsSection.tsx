import { createElement, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { API_URL, ApiError, apiRequest } from "../services/api";
import { getOrCreateInstallationId, getToken } from "../services/secure";
import { colors, radii } from "../theme";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

type PolicyDoc = {
  slug: string;
  type: string;
  title: string;
  description: string;
  version: string;
  uploaded: boolean;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  updatedAt: string;
  downloadName: string;
};

type PickedPdf = { name: string; size?: number; blob?: Blob; uri?: string };

type Notice = { kind: "success" | "error"; text: string } | null;

const isWeb = Platform.OS === "web";

function formatSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function pickPdf(): Promise<PickedPdf | null> {
  if (isWeb && typeof document !== "undefined") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, size: file.size, blob: file } : null);
      };
      input.click();
    });
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { name: asset.name || "document.pdf", size: asset.size ?? undefined, uri: asset.uri };
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = { "X-Client-Platform": Platform.OS };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isWeb) headers["X-Installation-Id"] = await getOrCreateInstallationId();
  return headers;
}

/** XHR instead of fetch so the admin sees real upload progress. */
async function uploadWithProgress(
  slug: string,
  file: PickedPdf,
  onProgress: (pct: number) => void
): Promise<PolicyDoc> {
  const headers = await authHeaders();
  const form = new FormData();
  if (file.blob) form.append("file", file.blob, file.name);
  else form.append("file", { uri: file.uri, name: file.name, type: "application/pdf" } as unknown as Blob);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/admin/privacy/documents/${slug}/file`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { data?: PolicyDoc; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.data) resolve(body.data);
      else reject(new ApiError(body.error ?? "Upload failed", xhr.status));
    };
    xhr.onerror = () =>
      reject(new ApiError("We couldn't reach LEARN WISE. Check your connection and try again.", 0));
    xhr.send(form);
  });
}

async function fetchPdfBlob(slug: string, download: boolean): Promise<Blob> {
  const res = await fetch(
    `${API_URL}/admin/privacy/documents/${slug}/file${download ? "?download=1" : ""}`,
    { headers: await authHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "Could not load the PDF", res.status);
  }
  return res.blob();
}

async function openOnPhone(slug: string, download: boolean) {
  const link = await apiRequest<{ path: string }>(
    `/admin/privacy/documents/${slug}/link${download ? "?download=1" : ""}`,
    { method: "POST" }
  );
  await Linking.openURL(`${API_URL}${link.path}`);
}

function ActionButton({
  icon,
  label,
  hint,
  onPress,
  tone = "default",
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const color =
    tone === "danger" ? colors.danger : tone === "primary" ? "#fff" : colors.primaryDark;
  return (
    <View style={styles.actionWrap}>
      {hover && isWeb ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{hint}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => {
          setHover(false);
          onPress();
        }}
        disabled={disabled}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        accessibilityRole="button"
        accessibilityLabel={hint}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.action,
          tone === "primary" && styles.actionPrimary,
          tone === "danger" && styles.actionDanger,
          (pressed || hover) && !disabled && styles.actionHover,
          disabled && styles.actionDisabled,
        ]}
      >
        <Ionicons name={icon} size={16} color={disabled ? colors.tabInactive : color} />
        <Text style={[styles.actionText, { color: disabled ? colors.tabInactive : color }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function PolicyDocumentsSection() {
  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ slug: string; pct: number; name: string } | null>(null);
  const [preview, setPreview] = useState<{ doc: PolicyDoc; url: string } | null>(null);
  const [editing, setEditing] = useState<PolicyDoc | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", version: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<PolicyDoc | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await apiRequest<PolicyDoc[]>("/admin/privacy/documents"));
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof ApiError ? e.message : "Could not load policy documents",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    return () => {
      if (preview && isWeb) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const replaceDoc = (next: PolicyDoc) =>
    setDocs((list) => list.map((d) => (d.slug === next.slug ? next : d)));

  const fail = (e: unknown, fallback: string) =>
    setNotice({ kind: "error", text: e instanceof ApiError ? e.message : fallback });

  async function onUpload(doc: PolicyDoc) {
    const file = await pickPdf();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setNotice({ kind: "error", text: "Only PDF files (.pdf) can be uploaded." });
      return;
    }
    if (file.size != null && file.size > MAX_PDF_BYTES) {
      setNotice({ kind: "error", text: "This PDF is larger than 10 MB." });
      return;
    }
    setBusySlug(doc.slug);
    setProgress({ slug: doc.slug, pct: 0, name: file.name });
    try {
      const updated = await uploadWithProgress(doc.slug, file, (pct) =>
        setProgress({ slug: doc.slug, pct, name: file.name })
      );
      replaceDoc(updated);
      setNotice({
        kind: "success",
        text: `${doc.uploaded ? "Replaced" : "Uploaded"} “${updated.fileName}” for ${updated.title}.`,
      });
    } catch (e) {
      fail(e, "Upload failed. The previous PDF was kept.");
    } finally {
      setBusySlug(null);
      setProgress(null);
    }
  }

  async function onView(doc: PolicyDoc) {
    setBusySlug(doc.slug);
    try {
      if (isWeb) {
        const blob = await fetchPdfBlob(doc.slug, false);
        setPreview({ doc, url: URL.createObjectURL(blob) });
      } else {
        await openOnPhone(doc.slug, false);
      }
    } catch (e) {
      fail(e, "Could not open the PDF");
    } finally {
      setBusySlug(null);
    }
  }

  async function onDownload(doc: PolicyDoc) {
    setBusySlug(doc.slug);
    try {
      if (isWeb) {
        const blob = await fetchPdfBlob(doc.slug, true);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else {
        await openOnPhone(doc.slug, true);
      }
      setNotice({ kind: "success", text: `Downloading ${doc.downloadName}` });
    } catch (e) {
      fail(e, "Download failed");
    } finally {
      setBusySlug(null);
    }
  }

  function onEdit(doc: PolicyDoc) {
    setEditForm({ title: doc.title, description: doc.description, version: doc.version });
    setEditing(doc);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editForm.title.trim()) {
      setNotice({ kind: "error", text: "Document title is required." });
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await apiRequest<PolicyDoc>(`/admin/privacy/documents/${editing.slug}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      replaceDoc(updated);
      setEditing(null);
      setNotice({ kind: "success", text: "Document details saved." });
    } catch (e) {
      fail(e, "Could not save details");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setConfirmingDelete(true);
    try {
      await apiRequest<PolicyDoc>(`/admin/privacy/documents/${deleting.slug}/file`, {
        method: "DELETE",
      });
      setNotice({ kind: "success", text: `Deleted the PDF for ${deleting.title}.` });
      setDeleting(null);
      await load();
    } catch (e) {
      fail(e, "Delete failed");
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading} accessibilityRole="header">
            Policy Documents
          </Text>
          <Text style={styles.subheading}>
            Manage, update and publish LEARN WISE legal and privacy documents.
          </Text>
        </View>
      </View>

      {notice ? (
        <View
          style={[styles.notice, notice.kind === "success" ? styles.noticeOk : styles.noticeErr]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name={notice.kind === "success" ? "checkmark-circle" : "alert-circle"}
            size={18}
            color={notice.kind === "success" ? colors.mintDeep : colors.danger}
          />
          <Text
            style={[
              styles.noticeText,
              { color: notice.kind === "success" ? colors.mintDeep : colors.danger },
            ]}
          >
            {notice.text}
          </Text>
        </View>
      ) : null}

      {loading && !docs.length ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading documents…</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {docs.map((doc) => {
          const busy = busySlug === doc.slug;
          const uploading = progress?.slug === doc.slug ? progress : null;
          return (
            <View key={doc.slug} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.docIcon, doc.uploaded ? styles.docIconOn : null]}>
                  <MaterialCommunityIcons
                    name={doc.uploaded ? "file-pdf-box" : "file-document-outline"}
                    size={30}
                    color={doc.uploaded ? "#E5484D" : colors.primary}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cardTitle}>{doc.title}</Text>
                  <View style={[styles.badge, doc.uploaded ? styles.badgeOn : styles.badgeOff]}>
                    <Ionicons
                      name={doc.uploaded ? "checkmark-circle" : "time-outline"}
                      size={12}
                      color={doc.uploaded ? colors.mintDeep : "#B45309"}
                    />
                    <Text style={[styles.badgeText, { color: doc.uploaded ? colors.mintDeep : "#B45309" }]}>
                      {doc.uploaded ? "Uploaded" : "Not Uploaded"}
                    </Text>
                  </View>
                  {doc.description ? <Text style={styles.cardDesc}>{doc.description}</Text> : null}
                </View>
              </View>

              {doc.uploaded ? (
                <View style={styles.metaGrid}>
                  <MetaItem label="File name" value={doc.fileName ?? "—"} />
                  <MetaItem label="File size" value={formatSize(doc.fileSize)} />
                  <MetaItem label="Last updated" value={formatDate(doc.uploadedAt ?? doc.updatedAt)} />
                  <MetaItem label="Version" value={doc.version || "—"} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="cloud-upload-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    No PDF uploaded yet. Upload the official document to make it available here.
                  </Text>
                </View>
              )}

              {uploading ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.muted} numberOfLines={1}>
                    Uploading {uploading.name} — {uploading.pct}%
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploading.pct}%` }]} />
                  </View>
                </View>
              ) : null}

              <View style={styles.actions}>
                <ActionButton
                  icon="eye-outline"
                  label="View"
                  hint={`Preview ${doc.title}`}
                  onPress={() => void onView(doc)}
                  disabled={!doc.uploaded || busy}
                />
                <ActionButton
                  icon="create-outline"
                  label="Edit"
                  hint={`Edit details of ${doc.title}`}
                  onPress={() => onEdit(doc)}
                  disabled={busy}
                />
                <ActionButton
                  icon="cloud-upload-outline"
                  label={doc.uploaded ? "Replace" : "Upload"}
                  hint={doc.uploaded ? `Replace the PDF for ${doc.title}` : `Upload a PDF for ${doc.title}`}
                  onPress={() => void onUpload(doc)}
                  tone="primary"
                  disabled={busy}
                />
                <ActionButton
                  icon="download-outline"
                  label="Download"
                  hint={`Download ${doc.downloadName}`}
                  onPress={() => void onDownload(doc)}
                  disabled={!doc.uploaded || busy}
                />
                <ActionButton
                  icon="trash-outline"
                  label="Delete"
                  hint={`Delete the PDF for ${doc.title}`}
                  onPress={() => setDeleting(doc)}
                  tone="danger"
                  disabled={!doc.uploaded || busy}
                />
                {busy && !uploading ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={!!preview} animationType="fade" transparent onRequestClose={() => setPreview(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, styles.previewModal]}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="file-pdf-box" size={22} color="#E5484D" />
              <Text style={styles.modalTitle} numberOfLines={1}>
                {preview?.doc.title}
              </Text>
              {preview && isWeb ? (
                <Pressable
                  onPress={() => window.open(preview.url, "_blank", "noopener")}
                  accessibilityRole="button"
                  accessibilityLabel="Open PDF in a new tab"
                  style={styles.iconBtn}
                >
                  <Ionicons name="open-outline" size={20} color={colors.primaryDark} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setPreview(null)}
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                style={styles.iconBtn}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            {preview && isWeb
              ? createElement("iframe", {
                  src: preview.url,
                  title: preview.doc.title,
                  style: { flex: 1, width: "100%", height: "100%", border: 0, borderRadius: 12, background: "#F4F4F5" },
                })
              : null}
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>Edit document details</Text>
            </View>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={editForm.title}
              onChangeText={(title) => setEditForm((f) => ({ ...f, title }))}
              accessibilityLabel="Document title"
              maxLength={200}
            />
            <Text style={styles.fieldLabel}>Short description</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={editForm.description}
              onChangeText={(description) => setEditForm((f) => ({ ...f, description }))}
              accessibilityLabel="Document description"
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.fieldLabel}>Version</Text>
            <TextInput
              style={styles.input}
              value={editForm.version}
              onChangeText={(version) => setEditForm((f) => ({ ...f, version }))}
              placeholder="e.g. 1.0"
              placeholderTextColor={colors.tabInactive}
              accessibilityLabel="Document version"
              maxLength={40}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.btnGhost} onPress={() => setEditing(null)} accessibilityRole="button">
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.btnPrimary}
                onPress={() => void saveEdit()}
                disabled={savingEdit}
                accessibilityRole="button"
              >
                {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleting} animationType="fade" transparent onRequestClose={() => setDeleting(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={styles.modalTitle}>Delete document?</Text>
            </View>
            <Text style={styles.confirmText}>
              This permanently removes the uploaded PDF for{" "}
              <Text style={{ fontWeight: "800" }}>{deleting?.title}</Text>
              {deleting?.fileName ? ` (${deleting.fileName})` : ""}. The card stays so you can
              upload a new file later.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.btnGhost} onPress={() => setDeleting(null)} accessibilityRole="button">
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.btnDanger}
                onPress={() => void confirmDelete()}
                disabled={confirmingDelete}
                accessibilityRole="button"
                accessibilityLabel={`Confirm delete of ${deleting?.title ?? "document"}`}
              >
                {confirmingDelete ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  header: { flexDirection: "row", gap: 12, alignItems: "center" },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { fontSize: 20, fontWeight: "800", color: colors.text },
  subheading: { color: colors.textMuted, marginTop: 2, lineHeight: 19 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  noticeOk: { backgroundColor: colors.mintSoft, borderColor: "#A7F3D0" },
  noticeErr: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  noticeText: { flex: 1, fontWeight: "700" },
  loadingBox: { flexDirection: "row", gap: 10, alignItems: "center", padding: 8 },
  muted: { color: colors.textMuted, fontSize: 13 },
  grid: { gap: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    shadowColor: "#1F1635",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconOn: { backgroundColor: "#FFECEC" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardDesc: { color: colors.textMuted, lineHeight: 18, fontSize: 13 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOn: { backgroundColor: colors.mintSoft },
  badgeOff: { backgroundColor: "#FEF3C7" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#FAFAFF",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    rowGap: 10,
  },
  metaItem: { width: "50%", paddingRight: 8, gap: 2 },
  metaLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  metaValue: { fontSize: 13, fontWeight: "600", color: colors.text },
  empty: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0EE",
    padding: 12,
  },
  emptyText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: radii.pill, backgroundColor: colors.primarySoft, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radii.pill },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  actionWrap: { position: "relative" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionDanger: { borderColor: "#FECACA", backgroundColor: "#FFF5F5" },
  actionHover: { opacity: 0.85 },
  actionDisabled: { backgroundColor: "#F4F4F5", borderColor: "#ECECEF" },
  actionText: { fontWeight: "700", fontSize: 13 },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    marginBottom: 6,
    backgroundColor: "#1F1635",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
    minWidth: 140,
  },
  tooltipText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 12, 40, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 18,
    gap: 10,
  },
  previewModal: { maxWidth: 960, height: "90%", padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: colors.text },
  iconBtn: { padding: 6, borderRadius: radii.pill },
  fieldLabel: { fontWeight: "700", color: colors.text, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.text,
    fontSize: 15,
  },
  confirmText: { color: colors.text, lineHeight: 21 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  btnGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { fontWeight: "700", color: colors.text },
  btnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    minWidth: 90,
    alignItems: "center",
  },
  btnDanger: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
    minWidth: 90,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
});
