"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@little-readers/ui";
import { AdminShell } from "@/components/AdminShell";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAdminGate } from "@/lib/use-admin-gate";

type AdminSub = {
  id: string;
  plan: string;
  status: string;
  startedAt: string;
  expiresAt: string;
  includedSeats: number;
  extraSeats: number;
  eligible: boolean;
  user: { id: string; name: string; email: string };
  seats: {
    included: number;
    extra: number;
    capacity: number;
    assigned: number;
    available: number;
    children: Array<{ id: string; displayName: string; hasLearningSeat: boolean }>;
  };
};

export default function AdminSubscriptionsPage() {
  const { ready, token, error: gateError } = useAdminGate();
  const [rows, setRows] = useState<AdminSub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantCount, setGrantCount] = useState<Record<string, string>>({});
  const [subEmail, setSubEmail] = useState("");
  const [subMonths, setSubMonths] = useState("12");
  const [payments, setPayments] = useState<
    Array<{
      id: string;
      amountCents: number;
      currency: string;
      status: string;
      provider: string;
      purpose: string;
      seatsPurchased: number;
      paidAt: string | null;
      createdAt: string;
      razorpayOrderId: string | null;
      razorpayPaymentId: string | null;
      user: { email: string; name: string };
      subscription: { plan: string; status: string; expiresAt: string } | null;
    }>
  >([]);

  const load = useCallback(async () => {
    if (!token) return;
    const [data, pay] = await Promise.all([
      apiRequest<AdminSub[]>("/subscriptions/admin", { token }),
      apiRequest<typeof payments>("/payments/admin?take=80", { token }),
    ]);
    setRows(data);
    setPayments(pay);
  }, [token]);

  useEffect(() => {
    if (token) void load().catch((e) => setError(String(e.message ?? e)));
  }, [token, load]);

  async function grant(parentUserId: string) {
    if (!token) return;
    const n = Number(grantCount[parentUserId] ?? "1");
    if (!window.confirm(`Grant ${n} add-on seat(s) to this parent?`)) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<{
        seatsAdded: number;
        subscription: { extraSeats: number; capacity: number };
      }>("/subscriptions/seats/grant", {
        method: "POST",
        token,
        body: JSON.stringify({
          parentUserId,
          seats: n,
          amountCents: 0,
          provider: "manual_admin",
        }),
      });
      setMessage(
        `Granted ${data.seatsAdded}. Extra now ${data.subscription.extraSeats}, capacity ${data.subscription.capacity}.`
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function grantSubscription() {
    if (!token) return;
    const email = subEmail.trim();
    const months = Number(subMonths);
    if (!email) {
      setError("Enter the parent's email");
      return;
    }
    if (!window.confirm(`Grant a free ${months}-month subscription to ${email}?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<{
        parent: { email: string };
        subscription: { plan: string; expiresAt: string; capacity: number };
        childrenSeated: number;
      }>("/subscriptions/admin/grant", {
        method: "POST",
        token,
        body: JSON.stringify({ parentEmail: email, months }),
      });
      setMessage(
        `Subscription active for ${data.parent.email} until ${new Date(
          data.subscription.expiresAt
        ).toLocaleDateString()} · ${data.subscription.capacity} seats · ${data.childrenSeated} child(ren) seated now.`
      );
      setSubEmail("");
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(parentUserId: string) {
    if (!token) return;
    const n = Number(grantCount[parentUserId] ?? "1");
    if (!window.confirm(`Revoke ${n} add-on seat(s)? Active assignments are checked first.`))
      return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<{
        seatsRevoked: number;
        subscription: { extraSeats: number; capacity: number };
      }>("/subscriptions/seats/revoke", {
        method: "POST",
        token,
        body: JSON.stringify({ parentUserId, seats: n }),
      });
      setMessage(
        `Revoked ${data.seatsRevoked}. Extra now ${data.subscription.extraSeats}, capacity ${data.subscription.capacity}.`
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !gateError) {
    return (
      <div className="admin-shell">
        <div className="panel">Loading…</div>
      </div>
    );
  }

  return (
    <AdminShell title="Subscriptions & Seats">
      {gateError || error ? <Alert tone="error">{gateError || error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <p style={{ color: "#94a3b8" }}>
        Manual Admin grants are distinct from Razorpay purchases (provider{" "}
        <code>manual_admin</code> vs <code>razorpay</code>). Revoke is blocked while seats
        are occupied beyond remaining capacity. Frontend “success” never grants seats.
      </p>
      <h2 style={{ color: "#e2e8f0", fontSize: 18 }}>Grant free subscription</h2>
      <div
        className="panel"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}
      >
        <input
          type="email"
          placeholder="Parent email"
          value={subEmail}
          onChange={(e) => setSubEmail(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <select value={subMonths} onChange={(e) => setSubMonths(e.target.value)}>
          <option value="1">1 month</option>
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
        </select>
        <Button disabled={busy} onClick={() => void grantSubscription()}>
          Grant subscription
        </Button>
        <span style={{ color: "#94a3b8", fontSize: 13 }}>
          Starts or extends the plan (2 seats included) and seats waiting children.
        </span>
      </div>
      <h2 style={{ color: "#e2e8f0", fontSize: 18 }}>Payment history</h2>
      <div className="panel" style={{ marginBottom: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th align="left">When</th>
              <th align="left">Parent</th>
              <th align="left">Purpose</th>
              <th align="left">Status</th>
              <th align="left">Provider</th>
              <th align="right">Amount</th>
              <th align="left">Refs</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.paidAt ?? p.createdAt).toLocaleString()}</td>
                <td>{p.user.email}</td>
                <td>
                  {p.purpose}
                  {p.seatsPurchased ? ` (+${p.seatsPurchased} seats)` : ""}
                </td>
                <td>{p.status}</td>
                <td>{p.provider}</td>
                <td align="right">
                  {p.currency} {(p.amountCents / 100).toFixed(2)}
                </td>
                <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.razorpayPaymentId ?? p.razorpayOrderId ?? "—"}
                  {p.subscription
                    ? ` · ${p.subscription.plan} exp ${new Date(p.subscription.expiresAt).toLocaleDateString()}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!payments.length ? <p style={{ opacity: 0.7 }}>No payments yet.</p> : null}
      </div>

      <h2 style={{ color: "#e2e8f0", fontSize: 18 }}>Subscriptions &amp; manual seats</h2>
      {rows.map((row) => (
        <div
          key={row.id}
          className="panel"
          style={{ display: "grid", gap: 8, marginBottom: 12 }}
        >
          <strong>
            {row.user.name} · {row.user.email}
          </strong>
          <span>
            {row.plan} · {row.status} · eligible {row.eligible ? "yes" : "no"}
          </span>
          <span>
            Seats {row.seats.assigned}/{row.seats.capacity} (included {row.seats.included} +
            extra {row.seats.extra}) · available {row.seats.available}
          </span>
          <ul style={{ margin: 0 }}>
            {row.seats.children.map((c) => (
              <li key={c.id}>
                {c.displayName}: {c.hasLearningSeat ? "seated" : "no seat"}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              Count
              <input
                style={{ width: 64, marginLeft: 6 }}
                value={grantCount[row.user.id] ?? "1"}
                onChange={(e) =>
                  setGrantCount((s) => ({ ...s, [row.user.id]: e.target.value }))
                }
              />
            </label>
            <Button disabled={busy} onClick={() => void grant(row.user.id)}>
              Grant add-on
            </Button>
            <Button disabled={busy} onClick={() => void revoke(row.user.id)}>
              Revoke add-on
            </Button>
          </div>
        </div>
      ))}
    </AdminShell>
  );
}
