"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { getActiveChild } from "@/lib/child-session";

interface CategoryCard {
  id: string;
  code: string;
  label: string;
  description: string | null;
  emoji: string;
  wordCount: number;
  unlocked: boolean;
  progress: {
    wordsLearned: number;
    points: number;
    stars: number;
    completed: boolean;
  } | null;
}

interface GroupBlock {
  id: string;
  code: string;
  label: string;
  categories: CategoryCard[];
}

interface Level1Data {
  level: {
    label: string;
    ageMin: number;
    ageMax: number;
    description: string | null;
  };
  groups: GroupBlock[];
}

export default function Level1HomePage() {
  const router = useRouter();
  const [data, setData] = useState<Level1Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const child = typeof window !== "undefined" ? getActiveChild() : null;

  useEffect(() => {
    const token = getToken();
    const active = getActiveChild();
    if (!token || !active) {
      router.replace("/kids");
      return;
    }

    const levelKey =
      (active as { level?: string }).level ||
      (active as { levelCode?: string }).levelCode ||
      "LEVEL_1";

    void apiRequest<Level1Data>(
      `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${encodeURIComponent(active.id)}`,
      { token }
    )
      .then(setData)
      .catch((err) => {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load curriculum for this child’s level"
        );
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="kids-shell l1-shell">
        <div className="kids-card">Loading curriculum…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="kids-shell l1-shell">
        <div className="kids-card">
          <Alert tone="error">{error ?? "Level 1 is unavailable"}</Alert>
          <Button variant="secondary" onClick={() => router.push("/kids")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="kids-shell l1-shell">
      <div className="l1-wrap">
        <header className="l1-header">
          <Button variant="secondary" onClick={() => router.push("/kids")}>
            ← Kids Zone
          </Button>
          <div>
            <p className="l1-eyebrow">Hi {child?.displayName ?? "friend"}!</p>
            <h1>{data.level.label}</h1>
            <p>
              Ages {data.level.ageMin}–{data.level.ageMax}. Tap a colorful card to
              play.
            </p>
          </div>
        </header>

        {error ? <Alert tone="error">{error}</Alert> : null}

        {data.groups.map((group) => (
          <section key={group.id} className="l1-group">
            <h2>{group.label}</h2>
            <div className="l1-cat-grid">
              {group.categories.map((cat) => {
                const learned = cat.progress?.wordsLearned ?? 0;
                const completed = cat.progress?.completed ?? false;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`l1-cat-card ${cat.unlocked ? "" : "is-locked"} ${
                      completed ? "is-done" : ""
                    }`}
                    disabled={!cat.unlocked}
                    onClick={() =>
                      router.push(
                        `/kids/level-1/play?categoryId=${encodeURIComponent(cat.id)}`
                      )
                    }
                  >
                    <span className="l1-cat-emoji" aria-hidden>
                      {cat.unlocked ? cat.emoji : "🔒"}
                    </span>
                    <strong>{cat.label}</strong>
                    <span>{cat.wordCount} words</span>
                    <span className="l1-cat-meta">
                      {completed
                        ? "⭐ Done!"
                        : `${learned} learned · ${cat.progress?.stars ?? 0}★`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
