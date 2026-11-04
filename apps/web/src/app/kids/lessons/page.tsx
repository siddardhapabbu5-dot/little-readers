"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { getActiveChild } from "@/lib/child-session";

type LessonRow = {
  id: string;
  title: string;
  description: string | null;
  playStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  wordCount: number;
};

export default function KidsLessonsPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [childName, setChildName] = useState("");

  useEffect(() => {
    const token = getToken();
    const child = getActiveChild();
    if (!token || !child) {
      router.replace("/kids");
      return;
    }
    setChildName(child.displayName);
    void apiRequest<LessonRow[]>(
      `/learning/lessons?childId=${encodeURIComponent(child.id)}`,
      { token }
    )
      .then(setLessons)
      .catch((e) =>
        setError(e instanceof ApiClientError ? e.message : "Failed to load lessons")
      );
  }, [router]);

  function statusLabel(s: LessonRow["playStatus"]) {
    if (s === "COMPLETED") return "Completed";
    if (s === "IN_PROGRESS") return "In progress";
    return "Not started";
  }

  return (
    <div className="kids-shell">
      <div className="panel" style={{ maxWidth: 720, margin: "24px auto", display: "grid", gap: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/kids")}>
          ← Kids home
        </Button>
        <h1 style={{ margin: 0 }}>Lessons for {childName || "you"}</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Listen &amp; Spell only. Your progress stays on this child profile.
        </p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!lessons.length && !error ? <p>No published lessons for this grade yet.</p> : null}
        {lessons.map((l) => (
          <article
            key={l.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 14,
              display: "grid",
              gap: 6,
            }}
          >
            <strong>{l.title}</strong>
            {l.description ? <span style={{ opacity: 0.85 }}>{l.description}</span> : null}
            <span style={{ fontSize: 14 }}>
              {l.wordCount} words · {statusLabel(l.playStatus)}
            </span>
            <Button onClick={() => router.push(`/kids/lessons/${l.id}`)}>Open</Button>
          </article>
        ))}
        <Button variant="secondary" onClick={() => router.push("/kids/level-1")}>
          Category practice (Level 1)
        </Button>
      </div>
    </div>
  );
}
