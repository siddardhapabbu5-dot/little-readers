"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, TextField } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";
import { saveActiveChild } from "@/lib/child-session";

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  children: Array<{
    id: string;
    displayName: string;
    birthYear: number;
    level: string;
  }>;
}

interface ChildRow {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
  hasLearningSeat?: boolean;
}

interface SubMe {
  eligible: boolean;
  reason: string | null;
  subscription: {
    plan: string;
    status: string;
    startedAt: string;
    expiresAt: string;
    graceEndsAt?: string | null;
    includedSeats: number;
    extraSeats: number;
  } | null;
  seats: {
    included: number;
    extra: number;
    capacity: number;
    assigned: number;
    available: number;
    children: Array<{ id: string; displayName: string; hasLearningSeat: boolean }>;
  };
}

interface LearningOverview {
  summary: {
    categoriesCompleted: number;
    wordsLearned: number;
    points: number;
    stars: number;
    minutesLearned: number;
    listenAccuracy: number;
    spellAccuracy: number;
  };
  categories: Array<{
    label: string;
    emoji: string;
    group: string;
    wordsLearned: number;
    points: number;
    stars: number;
    completed: boolean;
    listenCorrect: number;
    listenAttempts: number;
    spellCorrect: number;
    spellAttempts: number;
    minutesLearned: number;
    lastPlayedAt: string | null;
  }>;
  history: Array<{
    sessionId: string;
    category: string | { label: string; emoji: string };
    emoji?: string;
    points: number;
    stars: number;
    wordsLearned: number;
    completedAt: string | null;
    durationSec: number;
  }>;
  achievements: Array<{
    code: string;
    title: string;
    description: string | null;
    earnedAt: string;
  }>;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [learning, setLearning] = useState<LearningOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sub, setSub] = useState<SubMe | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);

  async function loadLearning(token: string, childId: string) {
    if (!childId) {
      setLearning(null);
      return;
    }
    try {
      const data = await apiRequest<LearningOverview>(
        `/learning/progress/${childId}`,
        { token }
      );
      setLearning(data);
    } catch {
      setLearning(null);
    }
  }

  async function load() {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const [user, kids, subscription] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { token }),
        apiRequest<ChildRow[]>("/children", { token }),
        apiRequest<SubMe>("/subscriptions/me", { token }),
      ]);
      setMe(user);
      setChildren(kids);
      setSub(subscription);
      const nextId = selectedChildId || kids[0]?.id || "";
      setSelectedChildId(nextId);
      await loadLearning(token, nextId);
      setError(null);
    } catch (err) {
      clearToken();
      router.replace("/login");
      if (err instanceof ApiClientError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSelectChild(childId: string) {
    setSelectedChildId(childId);
    const token = getToken();
    if (token) await loadLearning(token, childId);
  }

  async function toggleSeat(childId: string, seated: boolean) {
    const token = getToken();
    if (!token) return;
    setSeatBusy(true);
    setError(null);
    try {
      await apiRequest(
        seated ? "/subscriptions/seats/unassign" : "/subscriptions/seats/assign",
        {
          method: "POST",
          token,
          body: JSON.stringify({ childId }),
        }
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Seat update failed");
    } finally {
      setSeatBusy(false);
    }
  }

  async function onCreateChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest("/children", {
        method: "POST",
        token,
        body: JSON.stringify({
          displayName: String(form.get("displayName") ?? ""),
          birthYear: Number(form.get("birthYear")),
        }),
      });
      formElement.reset();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not add child"
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="parent-shell">
        <div className="panel">Loading parent dashboard…</div>
      </div>
    );
  }

  const selected = children.find((c) => c.id === selectedChildId);

  return (
    <div className="parent-shell">
      <div className="panel" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 6px" }}>Parent dashboard</h1>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as {me?.name} ({me?.email})
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              onClick={() => {
                if (selected) {
                  saveActiveChild({
                    id: selected.id,
                    displayName: selected.displayName,
                    birthYear: selected.birthYear,
                    level: selected.level,
                  });
                }
                router.push("/kids");
              }}
            >
              Open Kids Zone
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                clearToken();
                router.push("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={{ marginTop: 0 }}>Subscription &amp; child seats</h2>
          {sub?.subscription ? (
            <p className="muted" style={{ margin: 0 }}>
              Plan <strong>{sub.subscription.plan}</strong> · {sub.subscription.status} ·
              started {new Date(sub.subscription.startedAt).toLocaleDateString()} ·
              expires {new Date(sub.subscription.expiresAt).toLocaleDateString()}
              {sub.subscription.graceEndsAt
                ? ` · grace until ${new Date(sub.subscription.graceEndsAt).toLocaleDateString()}`
                : ""}
              {" · "}
              {sub.eligible ? "eligible for learning" : sub.reason}
            </p>
          ) : (
            <p className="muted">No subscription on file.</p>
          )}
          {sub?.seats ? (
            <p style={{ margin: 0 }}>
              Seats {sub.seats.assigned}/{sub.seats.capacity} used · {sub.seats.included}{" "}
              included · {sub.seats.extra} add-on · {sub.seats.available} available.
              Base plan covers 2 children; extra seats need purchase or Admin grant.
            </p>
          ) : null}
          <p style={{ margin: 0 }}>
            <Link href="/parent/checkout">Open secure checkout (Razorpay)</Link>
            {" · "}
            <Link href="/parent/payments">Payment history</Link>
          </p>
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Child profiles</h2>
          {children.length === 0 ? (
            <p className="muted">No children yet. Add a profile below.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {children.map((child) => {
                const seated = Boolean(
                  child.hasLearningSeat ??
                    sub?.seats.children.find((c) => c.id === child.id)?.hasLearningSeat
                );
                return (
                  <div
                    key={child.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      border:
                        child.id === selectedChildId
                          ? "2px solid #ea580c"
                          : "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: "10px 14px",
                      background: child.id === selectedChildId ? "#fff7ed" : "#fff",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void onSelectChild(child.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 700,
                        textAlign: "left",
                        flex: 1,
                      }}
                    >
                      {child.displayName} · {child.level} · born {child.birthYear}
                      {" · "}
                      {seated ? "Seat active" : "Needs seat"}
                    </button>
                    <Button
                      variant="secondary"
                      disabled={seatBusy}
                      onClick={() => void toggleSeat(child.id, seated)}
                    >
                      {seated ? "Remove seat" : "Assign seat"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {selected && learning ? (
          <section style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>
              Level 1 progress · {selected.displayName}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 10,
              }}
            >
              {[
                ["Categories", learning.summary.categoriesCompleted],
                ["Words", learning.summary.wordsLearned],
                ["Points", learning.summary.points],
                ["Stars", learning.summary.stars],
                ["Minutes", learning.summary.minutesLearned],
                ["Listen %", learning.summary.listenAccuracy],
                ["Letters/Spell %", learning.summary.spellAccuracy],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  style={{
                    background: "#fff7ed",
                    borderRadius: 14,
                    padding: 12,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#c2410c" }}>
                    {value}
                  </div>
                  <div className="muted">{label}</div>
                </div>
              ))}
            </div>

            {learning.categories.length > 0 ? (
              <div>
                <h3>Categories</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {learning.categories.map((cat) => (
                    <li key={cat.label} style={{ marginBottom: 8 }}>
                      {cat.emoji} <strong>{cat.label}</strong> ({cat.group}) —{" "}
                      {cat.wordsLearned} words · {cat.points} pts · {cat.stars}★
                      {cat.completed ? " · completed" : ""} · listen{" "}
                      {cat.listenCorrect}/{cat.listenAttempts} · letters{" "}
                      {cat.spellCorrect}/{cat.spellAttempts}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">
                No Level 1 sessions yet. Open Kids Zone → Level 1 to begin.
              </p>
            )}

            {learning.history.length > 0 ? (
              <div>
                <h3>Recent sessions</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {learning.history.map((h) => (
                    <li key={h.sessionId} style={{ marginBottom: 6 }}>
                      {typeof h.category === "string"
                        ? `${h.emoji ?? ""} ${h.category}`
                        : `${h.category.emoji} ${h.category.label}`}{" "}
                      · {h.points} pts · {h.stars}★ ·{" "}
                      {h.wordsLearned} words
                      {h.completedAt
                        ? ` · ${new Date(h.completedAt).toLocaleString()}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {learning.achievements.length > 0 ? (
              <div>
                <h3>Achievements</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {learning.achievements.map((a) => (
                    <li key={a.code}>
                      🏅 {a.title}
                      {a.description ? ` — ${a.description}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <form onSubmit={onCreateChild} style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Add child</h3>
          <TextField label="Display name" name="displayName" required maxLength={50} />
          <TextField
            label="Birth year"
            name="birthYear"
            type="number"
            required
            min={1980}
            max={new Date().getFullYear()}
          />
          <Button type="submit" loading={creating}>
            Save child profile
          </Button>
        </form>
      </div>
    </div>
  );
}
