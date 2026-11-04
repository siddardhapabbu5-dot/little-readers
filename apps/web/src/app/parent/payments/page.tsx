"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";

type Pay = {
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
};

export default function ParentPaymentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Pay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login?next=/parent/payments");
      return;
    }
    void apiRequest<Pay[]>("/payments/me", { token: t })
      .then(setRows)
      .catch((e) => setError(String(e.message ?? e)));
  }, [router]);

  return (
    <div style={{ maxWidth: 800, margin: "32px auto", padding: 20, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Payment history</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/parent">Dashboard</Link>
          <Link href="/parent/checkout">Checkout</Link>
        </div>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {rows.map((p) => (
          <li key={p.id} className="panel">
            <strong>
              {p.purpose} · {p.status}
            </strong>
            <div>
              {p.currency} {(p.amountCents / 100).toFixed(2)} · {p.provider}
              {p.seatsPurchased ? ` · +${p.seatsPurchased} seats` : ""}
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {new Date(p.paidAt ?? p.createdAt).toLocaleString()}
              {p.razorpayPaymentId ? ` · ${p.razorpayPaymentId}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {!rows.length ? <p style={{ opacity: 0.7 }}>No payments yet.</p> : null}
      <Button variant="secondary" onClick={() => router.push("/parent/checkout")}>
        Buy or renew
      </Button>
    </div>
  );
}
