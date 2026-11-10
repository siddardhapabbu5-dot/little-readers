import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "../components/AuthGate";
import { PolicyDocumentsSection } from "../components/PolicyDocumentsSection";
import { Card, ErrorText, KeyboardScroll, SoftButton, Title, LoadingSlot } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { colors, radii } from "../theme";

type Policy = {
  id: string;
  status: string;
  version: string;
  title: string;
  content: string;
  effectiveDate?: string | null;
  publicUrl?: string | null;
  legalBusinessName?: string | null;
  businessAddress?: string | null;
  country?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  dataRetentionInfo?: string | null;
  deletionRequestContact?: string | null;
  parentalConsentExplanation?: string | null;
  childDataDisclosure?: string | null;
  learningDataDisclosure?: string | null;
  deviceDataDisclosure?: string | null;
  thirdPartyDisclosure?: string | null;
};

type RequestRow = {
  id: string;
  requesterEmail: string;
  requesterName?: string | null;
  requestType: string;
  message: string;
  status: string;
  createdAt: string;
  adminNotes?: string | null;
};

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.area : null]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholder="Leave blank until legal/admin provides content"
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function PreviewBlock({ title, body }: { title: string; body?: string | null }) {
  if (!body?.trim()) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.section}>{title}</Text>
      <Text style={styles.previewBody}>{body}</Text>
    </View>
  );
}

function PolicyPreview({ policy }: { policy: Policy }) {
  const business = [
    policy.legalBusinessName,
    policy.businessAddress,
    policy.country,
    policy.supportEmail ? `Support: ${policy.supportEmail}` : null,
    policy.supportPhone ? `Phone: ${policy.supportPhone}` : null,
  ]
    .filter((v) => v?.trim())
    .join("\n");
  const effective = policy.effectiveDate ? new Date(policy.effectiveDate) : null;
  return (
    <Card style={{ gap: 12 }}>
      <Text style={styles.meta}>Preview — not public until published</Text>
      <Title>{policy.title?.trim() || "Privacy Policy"}</Title>
      <Text style={styles.meta}>
        Version: {policy.version}
        {effective && !Number.isNaN(effective.getTime())
          ? ` · Effective ${effective.toLocaleDateString()}`
          : ""}
      </Text>
      <PreviewBlock title="Business details" body={business} />
      <PreviewBlock title="Policy" body={policy.content} />
      <PreviewBlock
        title="Parent/guardian consent"
        body={policy.parentalConsentExplanation}
      />
      <PreviewBlock title="Child data collection" body={policy.childDataDisclosure} />
      <PreviewBlock title="Learning data" body={policy.learningDataDisclosure} />
      <PreviewBlock title="Device information" body={policy.deviceDataDisclosure} />
      <PreviewBlock title="Third-party services" body={policy.thirdPartyDisclosure} />
      <PreviewBlock title="Data retention" body={policy.dataRetentionInfo} />
      <PreviewBlock
        title="Account / data deletion requests"
        body={
          policy.deletionRequestContact
            ? `Contact: ${policy.deletionRequestContact}. Requests are reviewed by an administrator; accounts and learning history are not deleted automatically.`
            : null
        }
      />
    </Card>
  );
}

export default function AdminPrivacyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [published, setPublished] = useState<Policy | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; status: string; version: string; title: string }>
  >([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workspace, reqs] = await Promise.all([
        apiRequest<{
          draft: Policy;
          published: Policy | null;
          history: Array<{
            id: string;
            status: string;
            version: string;
            title: string;
          }>;
        }>("/admin/privacy/policy"),
        apiRequest<RequestRow[]>("/admin/privacy/requests").catch(() => []),
      ]);
      setDraft(workspace.draft);
      setPublished(workspace.published);
      setHistory(workspace.history ?? []);
      setRequests(reqs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load privacy settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function patch(key: keyof Policy, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const data = await apiRequest<Policy>("/admin/privacy/policy", {
        method: "PUT",
        body: JSON.stringify({
          version: draft.version,
          title: draft.title,
          content: draft.content,
          effectiveDate: draft.effectiveDate || null,
          publicUrl: draft.publicUrl,
          legalBusinessName: draft.legalBusinessName,
          businessAddress: draft.businessAddress,
          country: draft.country,
          supportEmail: draft.supportEmail || null,
          supportPhone: draft.supportPhone,
          dataRetentionInfo: draft.dataRetentionInfo,
          deletionRequestContact: draft.deletionRequestContact,
          parentalConsentExplanation: draft.parentalConsentExplanation,
          childDataDisclosure: draft.childDataDisclosure,
          learningDataDisclosure: draft.learningDataDisclosure,
          deviceDataDisclosure: draft.deviceDataDisclosure,
          thirdPartyDisclosure: draft.thirdPartyDisclosure,
        }),
      });
      setDraft(data);
      setInfo("Draft saved. Not published.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function publish() {
    const run = () => {
      void (async () => {
        if (!draft) return;
        setSaving(true);
        setError(null);
        setInfo(null);
        try {
          await apiRequest<Policy>("/admin/privacy/policy", {
            method: "PUT",
            body: JSON.stringify({
              version: draft.version,
              title: draft.title,
              content: draft.content,
              effectiveDate: draft.effectiveDate || null,
              publicUrl: draft.publicUrl,
              legalBusinessName: draft.legalBusinessName,
              businessAddress: draft.businessAddress,
              country: draft.country,
              supportEmail: draft.supportEmail || null,
              supportPhone: draft.supportPhone,
              dataRetentionInfo: draft.dataRetentionInfo,
              deletionRequestContact: draft.deletionRequestContact,
              parentalConsentExplanation: draft.parentalConsentExplanation,
              childDataDisclosure: draft.childDataDisclosure,
              learningDataDisclosure: draft.learningDataDisclosure,
              deviceDataDisclosure: draft.deviceDataDisclosure,
              thirdPartyDisclosure: draft.thirdPartyDisclosure,
            }),
          });
          const data = await apiRequest<{ message?: string }>(
            "/admin/privacy/policy/publish",
            { method: "POST" }
          );
          setInfo(data.message ?? "Published");
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Publish failed");
        } finally {
          setSaving(false);
        }
      })();
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Publish this privacy policy? It becomes public.")) {
        run();
      }
      return;
    }
    Alert.alert("Publish policy?", "Published content becomes public immediately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Publish", onPress: run },
    ]);
  }

  async function setRequestStatus(id: string, status: string) {
    try {
      await apiRequest(`/admin/privacy/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update request");
    }
  }

  return (
    <AuthGate roles={["ADMIN", "SUPER_ADMIN"]}>
      <SafeAreaView style={styles.safe}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <SoftButton label="← Settings" onPress={() => router.back()} />
          <Title>Privacy & Compliance</Title>
          <Text style={styles.note}>
            Draft wording only until legal/admin completes and publishes. Do not
            invent company details.
          </Text>
          <LoadingSlot active={loading} />
          <ErrorText>{error}</ErrorText>
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <PolicyDocumentsSection />

          <Card style={{ gap: 6 }}>
            <Text style={styles.section}>Publication status</Text>
            <Text style={styles.meta}>
              Published:{" "}
              {published
                ? `${published.version} · ${published.title || "(untitled)"}`
                : "None — registration consent blocked until publish"}
            </Text>
            {history.slice(0, 5).map((h) => (
              <Text key={h.id} style={styles.meta}>
                {h.status} · {h.version} · {h.title || "(untitled)"}
              </Text>
            ))}
          </Card>

          {draft ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>Draft policy</Text>
              <Field
                label="Version"
                value={draft.version}
                onChange={(v) => patch("version", v)}
              />
              <Field
                label="Title"
                value={draft.title}
                onChange={(v) => patch("title", v)}
              />
              <Field
                label="Policy content"
                value={draft.content}
                onChange={(v) => patch("content", v)}
                multiline
              />
              <Field
                label="Effective date (ISO)"
                value={draft.effectiveDate ?? ""}
                onChange={(v) => patch("effectiveDate", v)}
              />
              <Field
                label="Public policy URL"
                value={draft.publicUrl ?? ""}
                onChange={(v) => patch("publicUrl", v)}
              />

              <Text style={styles.section}>Business details</Text>
              <Field
                label="Legal business name"
                value={draft.legalBusinessName ?? ""}
                onChange={(v) => patch("legalBusinessName", v)}
              />
              <Field
                label="Business address"
                value={draft.businessAddress ?? ""}
                onChange={(v) => patch("businessAddress", v)}
                multiline
              />
              <Field
                label="Country"
                value={draft.country ?? ""}
                onChange={(v) => patch("country", v)}
              />
              <Field
                label="Support email"
                value={draft.supportEmail ?? ""}
                onChange={(v) => patch("supportEmail", v)}
              />
              <Field
                label="Support phone"
                value={draft.supportPhone ?? ""}
                onChange={(v) => patch("supportPhone", v)}
              />
              <Field
                label="Deletion request contact"
                value={draft.deletionRequestContact ?? ""}
                onChange={(v) => patch("deletionRequestContact", v)}
              />
              <Field
                label="Data retention information"
                value={draft.dataRetentionInfo ?? ""}
                onChange={(v) => patch("dataRetentionInfo", v)}
                multiline
              />

              <Text style={styles.section}>Children&apos;s privacy</Text>
              <Field
                label="Parent/guardian consent explanation"
                value={draft.parentalConsentExplanation ?? ""}
                onChange={(v) => patch("parentalConsentExplanation", v)}
                multiline
              />
              <Field
                label="Child data collection disclosures"
                value={draft.childDataDisclosure ?? ""}
                onChange={(v) => patch("childDataDisclosure", v)}
                multiline
              />
              <Field
                label="Learning data disclosures"
                value={draft.learningDataDisclosure ?? ""}
                onChange={(v) => patch("learningDataDisclosure", v)}
                multiline
              />
              <Field
                label="Device information disclosures"
                value={draft.deviceDataDisclosure ?? ""}
                onChange={(v) => patch("deviceDataDisclosure", v)}
                multiline
              />
              <Field
                label="Third-party service disclosures"
                value={draft.thirdPartyDisclosure ?? ""}
                onChange={(v) => patch("thirdPartyDisclosure", v)}
                multiline
              />

              <SoftButton
                label={saving ? "Saving…" : "Save draft"}
                onPress={() => void saveDraft()}
              />
              <SoftButton
                label={previewing ? "Hide preview" : "Preview"}
                onPress={() => setPreviewing((v) => !v)}
              />
              <SoftButton label="Publish draft" onPress={publish} />
            </Card>
          ) : null}

          {draft && previewing ? <PolicyPreview policy={draft} /> : null}

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Privacy requests</Text>
            <Text style={styles.meta}>
              Review only — no automatic deletion of accounts or learning history.
            </Text>
            {!requests.length ? (
              <Text style={styles.meta}>No requests yet.</Text>
            ) : (
              requests.map((r) => (
                <View key={r.id} style={styles.req}>
                  <Text style={styles.reqTitle}>
                    {r.requestType} · {r.status}
                  </Text>
                  <Text style={styles.meta}>
                    {r.requesterName ?? "—"} · {r.requesterEmail}
                  </Text>
                  <Text style={styles.meta}>{r.message}</Text>
                  <View style={styles.row}>
                    <SoftButton
                      label="Under review"
                      onPress={() => void setRequestStatus(r.id, "UNDER_REVIEW")}
                    />
                    <SoftButton
                      label="Resolved"
                      onPress={() => void setRequestStatus(r.id, "RESOLVED")}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
        </KeyboardScroll>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  note: { color: colors.textMuted, lineHeight: 20 },
  info: { color: colors.success, fontWeight: "700" },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, lineHeight: 18 },
  label: { fontWeight: "700", color: colors.text, fontSize: 13 },
  previewBody: { color: colors.text, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.text,
  },
  area: { minHeight: 90 },
  req: {
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reqTitle: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
