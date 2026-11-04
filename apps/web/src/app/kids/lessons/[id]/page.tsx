"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { getActiveChild } from "@/lib/child-session";

type LessonDetail = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  playStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  wordCount: number;
  vocabItems: Array<{
    vocabularyWord: { id: string; text: string; meaning: string; emoji: string };
  }>;
};

export default function KidsLessonDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const child = getActiveChild();
    if (!token || !child || !params.id) {
      router.replace("/kids/lessons");
      return;
    }
    void apiRequest<LessonDetail>(
      `/learning/lessons/${params.id}?childId=${encodeURIComponent(child.id)}`,
      { token }
    )
      .then(setLesson)
      .catch((e) =>
        setError(e instanceof ApiClientError ? e.message : "Lesson not available")
      );
  }, [params.id, router]);

  function play() {
    if (!lesson) return;
    router.push(
      `/kids/level-1/play?lessonId=${encodeURIComponent(lesson.id)}&title=${encodeURIComponent(lesson.title)}`
    );
  }

  return (
    <div className="kids-shell">
      <div className="panel" style={{ maxWidth: 720, margin: "24px auto", display: "grid", gap: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/kids/lessons")}>
          ← Lessons
        </Button>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {lesson ? (
          <>
            <h1 style={{ margin: 0 }}>{lesson.title}</h1>
            <p style={{ margin: 0 }}>
              {lesson.playStatus === "IN_PROGRESS"
                ? "In progress"
                : lesson.playStatus === "COMPLETED"
                  ? "Completed"
                  : "Not started"}{" "}
              · {lesson.wordCount || lesson.vocabItems.length} words · Listen &amp; Spell
            </p>
            {lesson.description ? <p>{lesson.description}</p> : null}
            {lesson.instructions ? (
              <div>
                <strong>How to play</strong>
                <p>{lesson.instructions}</p>
              </div>
            ) : null}
            <div>
              <strong>Words</strong>
              <ul>
                {lesson.vocabItems.map((v) => (
                  <li key={v.vocabularyWord.id}>
                    {v.vocabularyWord.emoji} {v.vocabularyWord.text} —{" "}
                    {v.vocabularyWord.meaning}
                  </li>
                ))}
              </ul>
            </div>
            <Button onClick={play}>
              {lesson.playStatus === "IN_PROGRESS"
                ? "Resume lesson"
                : lesson.playStatus === "COMPLETED"
                  ? "Play again"
                  : "Start lesson"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
