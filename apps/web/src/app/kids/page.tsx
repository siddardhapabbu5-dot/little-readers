"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import {
  clearActiveChild,
  getActiveChild,
  saveActiveChild,
  type ActiveChild,
} from "@/lib/child-session";

interface ChildRow {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
}

const MODULES = [
  { title: "Alphabet", href: "/kids/modules/alphabet", ready: false },
  { title: "Phonics", href: "/kids/modules/phonics", ready: false },
  { title: "Vocabulary", href: "/kids/modules/vocabulary", ready: false },
  { title: "Reading", href: "/kids/modules/reading", ready: false },
  { title: "Spelling", href: "/kids/modules/spelling", ready: false },
  { title: "Stories", href: "/kids/modules/stories", ready: false },
  { title: "Quizzes", href: "/kids/modules/quizzes", ready: false },
  { title: "Rewards", href: "/kids/modules/rewards", ready: false },
];

export default function KidsHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsParent, setNeedsParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [activeChild, setActiveChild] = useState<ActiveChild | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setNeedsParent(true);
      setLoading(false);
      return;
    }

    const existing = getActiveChild();
    void apiRequest<ChildRow[]>("/children", { token })
      .then((kids) => {
        setChildren(kids);
        if (existing && kids.some((k) => k.id === existing.id)) {
          setActiveChild(existing);
        } else {
          clearActiveChild();
          setActiveChild(null);
        }
      })
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 401) {
          setNeedsParent(true);
        } else {
          setError(err instanceof Error ? err.message : "Could not load children");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function chooseChild(child: ChildRow) {
    const selected = {
      id: child.id,
      displayName: child.displayName,
      birthYear: child.birthYear,
      level: child.level,
    };
    saveActiveChild(selected);
    setActiveChild(selected);
  }

  if (loading) {
    return (
      <div className="kids-shell">
        <div className="kids-card">Loading Kids Zone…</div>
      </div>
    );
  }

  if (needsParent) {
    return (
      <div className="kids-shell">
        <div className="kids-card">
          <div style={{ fontSize: 64, lineHeight: 1 }}>🔐</div>
          <h1>Parent gate</h1>
          <p>
            A parent must sign in first, then choose a child profile to enter
            Kids Zone.
          </p>
          <a className="kids-cta" href="/login?next=/kids">
            Parent login →
          </a>
        </div>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="kids-shell">
        <div className="kids-card">
          <div style={{ fontSize: 64, lineHeight: 1 }}>🦊</div>
          <h1>Who is learning today?</h1>
          <p>Pick a child profile to open Kids Zone.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          {children.length === 0 ? (
            <>
              <p>No child profiles yet.</p>
              <a className="kids-cta" href="/parent">
                Add a child on Parent dashboard →
              </a>
            </>
          ) : (
            <div className="kids-child-grid">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  className="kids-child-btn"
                  onClick={() => chooseChild(child)}
                >
                  <span style={{ fontSize: 36 }}>🌟</span>
                  <strong>{child.displayName}</strong>
                  <span>
                    {child.level} · born {child.birthYear}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="kids-shell">
      <div className="kids-card" style={{ textAlign: "left" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 6px" }}>Hi {activeChild.displayName}!</h1>
            <p style={{ margin: 0, color: "#4b5563" }}>
              Level {activeChild.level}. Tap a big button to explore.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              clearActiveChild();
              setActiveChild(null);
            }}
          >
            Switch child
          </Button>
        </div>

        <div className="kids-module-grid">
          {MODULES.map((mod) => (
            <button
              key={mod.title}
              type="button"
              className="kids-module-btn"
              onClick={() => {
                if (mod.ready) router.push(mod.href);
                else setError(`${mod.title} lessons open in Phase 3.`);
              }}
            >
              {mod.title}
            </button>
          ))}
        </div>

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Alert tone="info">{error}</Alert>
          </div>
        ) : null}

        <p style={{ marginTop: 18, color: "#6b7280" }}>
          Learning content is loaded from the database in later phases — not
          hardcoded here.
        </p>
      </div>
    </div>
  );
}
