import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import { getActiveChild } from "../../services/secure";
import { colors } from "../../theme";

type LessonDetail = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  playStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  wordCount: number;
  activities: string[];
  activeSessionId: string | null;
  vocabItems: Array<{
    sortOrder: number;
    vocabularyWord: { id: string; text: string; meaning: string; emoji: string };
  }>;
};

/**
 * Kids lesson detail — Start / Resume Listen+Spell only.
 */
export default function LessonDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const child = await getActiveChild<{ id: string; displayName: string }>();
          if (!child?.id) {
            setError("Pick a child on the Parent screen first.");
            setLesson(null);
            return;
          }
          setChildId(child.id);
          const data = await apiRequest<LessonDetail>(
            `/learning/lessons/${id}?childId=${encodeURIComponent(child.id)}`
          );
          setLesson(data);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load lesson");
          setLesson(null);
        } finally {
          setLoading(false);
        }
      })();
    }, [id])
  );

  function startOrResume() {
    if (!lesson || !childId) return;
    router.push({
      pathname: "/play",
      params: {
        lessonId: lesson.id,
        childId,
        title: lesson.title,
      },
    });
  }

  const statusLabel =
    lesson?.playStatus === "COMPLETED"
      ? "Completed"
      : lesson?.playStatus === "IN_PROGRESS"
        ? "In progress"
        : "Not started";

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          <ErrorText>{error}</ErrorText>
          {lesson ? (
            <>
              <Title>{lesson.title}</Title>
              <Text style={styles.status}>{statusLabel}</Text>
              {lesson.description ? (
                <Text style={styles.desc}>{lesson.description}</Text>
              ) : null}
              {lesson.instructions ? (
                <Card>
                  <Text style={styles.section}>How to play</Text>
                  <Text style={styles.desc}>{lesson.instructions}</Text>
                </Card>
              ) : null}
              <Card style={{ gap: 6 }}>
                <Text style={styles.section}>
                  Words ({lesson.wordCount || lesson.vocabItems.length})
                </Text>
                <Text style={styles.note}>Activities: Listen & Spell only</Text>
                {lesson.vocabItems.map((v) => (
                  <Text key={v.vocabularyWord.id} style={styles.word}>
                    {v.vocabularyWord.emoji} {v.vocabularyWord.text}
                  </Text>
                ))}
              </Card>
              <SoftButton
                label={
                  lesson.playStatus === "IN_PROGRESS"
                    ? "Resume lesson"
                    : lesson.playStatus === "COMPLETED"
                      ? "Play again"
                      : "Start lesson"
                }
                onPress={startOrResume}
              />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  status: { fontWeight: "800", color: colors.primary, fontSize: 15 },
  desc: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  section: { fontWeight: "800", color: colors.text, fontSize: 16 },
  note: { color: colors.textMuted, fontSize: 12 },
  word: { color: colors.text, fontWeight: "700", fontSize: 15 },
});
