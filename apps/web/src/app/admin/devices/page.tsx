"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type ActiveSession = {
  id: string;
  deviceName: string | null;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string;
};

type SessionRow = ActiveSession & {
  status: string;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};

type ParentSessionRow = {
  id: string;
  name: string;
  email: string;
  activeSession: ActiveSession | null;
};

type ParentDirectoryRow = {
  id: string;
  children: Array<{ id: string; displayName: string; level: string | null }>;
  subscription: { plan: string; status: string; expiresAt: string } | null;
};

type ParentRow = ParentSessionRow & {
  children: ParentDirectoryRow["children"];
  subscription: ParentDirectoryRow["subscription"];
};

type ChildDevice = {
  registered: boolean;
  device: {
    platform: string;
    deviceLabel: string | null;
    registeredAt: string;
    lastSeenAt: string;
    installationIdSuffix: string;
  } | null;
};

type TransferEvent = {
  id: string;
  reason: string | null;
  createdAt: string;
  previousInstallationId?: string | null;
  newInstallationId?: string | null;
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function deviceLine(s: ActiveSession | null) {
  if (!s) return "Not logged in on any phone";
  return `${s.deviceName ?? s.platform}${s.appVersion ? ` · app ${s.appVersion}` : ""} · last seen ${fmt(s.lastSeenAt)}`;
}

const tableStyle = { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 };

const card = {
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 16,
};

const field = {
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #475569",
  borderRadius: 8,
  padding: "8px 10px",
};

export default function AdminDevicesPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [childDevices, setChildDevices] = useState<Record<string, ChildDevice>>({});
  const [transfers, setTransfers] = useState<Record<string, TransferEvent[]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadParents = useCallback(async () => {
    if (!token) return;
    const [sessionRows, directory] = await Promise.all([
      apiRequest<ParentSessionRow[]>("/admin/parents", { token }),
      apiRequest<ParentDirectoryRow[]>("/children/admin/parents", { token }),
    ]);
    const byId = new Map(directory.map((d) => [d.id, d]));
    setParents(
      sessionRows.map((p) => ({
        ...p,
        children: byId.get(p.id)?.children ?? [],
        subscription: byId.get(p.id)?.subscription ?? null,
      }))
    );
  }, [token]);

  useEffect(() => {
    if (token) void loadParents().catch((e) => setError(String(e.message ?? e)));
  }, [token, loadParents]);

  const selected = parents.find((p) => p.id === selectedId) ?? null;

  const loadDetail = useCallback(
    async (parent: ParentRow) => {
      if (!token) return;
      const [sessionData, ...childData] = await Promise.all([
        apiRequest<{ sessions: SessionRow[] }>(`/admin/parents/${parent.id}/device-sessions`, {
          token,
        }),
        ...parent.children.flatMap((c) => [
          apiRequest<ChildDevice>(`/devices/children/${c.id}`, { token }),
          apiRequest<TransferEvent[]>(`/devices/children/${c.id}/transfers`, { token }),
        ]),
      ]);
      setSessions(sessionData.sessions);
      const devices: Record<string, ChildDevice> = {};
      const history: Record<string, TransferEvent[]> = {};
      parent.children.forEach((c, i) => {
        devices[c.id] = childData[i * 2] as ChildDevice;
        history[c.id] = childData[i * 2 + 1] as TransferEvent[];
      });
      setChildDevices(devices);
      setTransfers(history);
    },
    [token]
  );

  async function openParent(parent: ParentRow) {
    setSelectedId(parent.id);
    setMessage(null);
    setError(null);
    setBusy(true);
    try {
      await loadDetail(parent);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load devices");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    if (!token || !selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await loadParents();
      await loadDetail(selected);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function revokeSession(sessionId: string) {
    if (!selected || !window.confirm("Log this parent out on that phone?")) return;
    void run(
      () =>
        apiRequest(`/admin/parents/${selected.id}/device-sessions/${sessionId}/revoke`, {
          method: "POST",
          token: token!,
          body: "{}",
        }),
      "Parent logged out on that phone."
    );
  }

  function resetSessions() {
    if (!selected || !window.confirm(`Log ${selected.email} out on all phones?`)) return;
    void run(
      () =>
        apiRequest(`/admin/parents/${selected.id}/device-sessions/reset`, {
          method: "POST",
          token: token!,
          body: "{}",
        }),
      "Parent logged out on all phones."
    );
  }

  function releaseChildPhone(childId: string, name: string) {
    const reason = (reasons[childId] ?? "").trim() || "Admin support transfer";
    if (!window.confirm(`Release ${name}'s phone? The next phone that opens learning will be registered.`))
      return;
    void run(
      () =>
        apiRequest("/devices/transfer", {
          method: "POST",
          token: token!,
          body: JSON.stringify({ childId, reason }),
        }),
      `${name}'s phone released. The next phone used for learning will be registered.`
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        p.email.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.children.some((c) => c.displayName.toLowerCase().includes(q))
    );
  }, [parents, search]);

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Devices">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <p style={{ color: "#94a3b8" }}>
        Each child can learn on only one registered phone. Each parent can be logged in on one phone
        at a time. Use this page for support requests such as a lost or replaced phone.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 2fr", gap: 16 }}>
        <div style={{ ...card, display: "grid", gap: 8, alignContent: "start" }}>
          <input
            placeholder="Search parent email, name or child"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={field}
          />
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void openParent(p)}
              style={{
                textAlign: "left",
                padding: 10,
                borderRadius: 8,
                border: p.id === selectedId ? "2px solid #7c5cff" : "1px solid #334155",
                background: p.id === selectedId ? "rgba(124,92,255,0.12)" : "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <strong>{p.email}</strong>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {p.children.length} child(ren) · {p.activeSession ? "logged in" : "not logged in"}
              </div>
            </button>
          ))}
          {!filtered.length ? <p style={{ opacity: 0.7 }}>No parents found.</p> : null}
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {!selected ? (
            <div style={card}>Select a parent to see their phones.</div>
          ) : (
            <>
              <div style={{ ...card, display: "grid", gap: 8 }}>
                <strong style={{ fontSize: 16 }}>
                  {selected.name} · {selected.email}
                </strong>
                <span>
                  Subscription:{" "}
                  {selected.subscription
                    ? `${selected.subscription.plan} · ${selected.subscription.status} · expires ${new Date(
                        selected.subscription.expiresAt
                      ).toLocaleDateString()}`
                    : "none"}
                </span>
                <span>Current login phone: {deviceLine(selected.activeSession)}</span>
              </div>

              <div style={{ ...card, overflowX: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Parent login phones</h3>
                  <Button disabled={busy} onClick={resetSessions}>
                    Log out on all phones
                  </Button>
                </div>
                <table style={{ ...tableStyle, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th align="left">Phone</th>
                      <th align="left">Status</th>
                      <th align="left">First login</th>
                      <th align="left">Last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.deviceName ?? s.platform}
                          {s.appVersion ? ` · app ${s.appVersion}` : ""}
                        </td>
                        <td>
                          {s.status}
                          {s.revokedReason ? ` (${s.revokedReason})` : ""}
                        </td>
                        <td>{fmt(s.createdAt)}</td>
                        <td>{fmt(s.lastSeenAt)}</td>
                        <td align="right">
                          {s.status === "ACTIVE" ? (
                            <Button disabled={busy} onClick={() => revokeSession(s.id)}>
                              Log out
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sessions.length ? (
                  <p style={{ opacity: 0.7 }}>No phone logins recorded yet.</p>
                ) : null}
              </div>

              {selected.children.map((c) => {
                const d = childDevices[c.id];
                const history = transfers[c.id] ?? [];
                return (
                  <div key={c.id} style={{ ...card, display: "grid", gap: 8 }}>
                    <h3 style={{ margin: 0 }}>
                      {c.displayName}
                      {c.level ? ` · ${c.level.replace("_", " ")}` : ""}
                    </h3>
                    <span>
                      Learning phone:{" "}
                      {d?.registered && d.device
                        ? `${d.device.deviceLabel ?? d.device.platform} (…${d.device.installationIdSuffix}) · registered ${fmt(
                            d.device.registeredAt
                          )} · last seen ${fmt(d.device.lastSeenAt)}`
                        : "No phone registered yet (registers the first time learning is opened)"}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        placeholder="Reason (e.g. lost or replaced phone)"
                        value={reasons[c.id] ?? ""}
                        onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))}
                        style={{ ...field, minWidth: 260 }}
                      />
                      <Button
                        disabled={busy || !d?.registered}
                        onClick={() => releaseChildPhone(c.id, c.displayName)}
                      >
                        Release phone
                      </Button>
                    </div>
                    <details>
                      <summary>Transfer history ({history.length})</summary>
                      <table style={{ ...tableStyle, marginTop: 6 }}>
                        <tbody>
                          {history.map((t) => (
                            <tr key={t.id}>
                              <td>{fmt(t.createdAt)}</td>
                              <td>{t.reason ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!history.length ? <p style={{ opacity: 0.7 }}>No transfers yet.</p> : null}
                    </details>
                  </div>
                );
              })}
              {!selected.children.length ? (
                <div style={card}>This parent has not added any children yet.</div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
