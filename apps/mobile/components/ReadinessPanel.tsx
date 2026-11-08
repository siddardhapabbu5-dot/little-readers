import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiRequest } from "../services/api";
import { displayEmoji } from "../services/emoji";
import { colors } from "../theme";

type Row = {
  id: string;
  label: string;
  emoji: string;
  isPublished: boolean;
  wordCount: number;
  missingPicture: string[];
  missingMeaning: string[];
  noAudioFile: string[];
  ready: boolean;
};

/** Per-category check that every word has a picture and meaning before publishing. */
export function ReadinessPanel({ grade }: { grade: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useFocusEffect(
    useCallback(() => {
      void apiRequest<Row[]>(`/learning/admin/readiness?grade=${encodeURIComponent(grade)}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, [grade])
  );

  if (!rows.length) return null;
  const readyCount = rows.filter((r) => r.ready).length;
  const totalWords = rows.reduce((s, r) => s + r.wordCount, 0);

  return (
    <View style={styles.box}>
      <Text style={styles.section}>
        Ready check · {readyCount}/{rows.length} categories ready · {totalWords} words
      </Text>
      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.name}>
            {r.ready ? "✅" : "⚠️"} {displayEmoji(r.emoji)} {r.label} · {r.wordCount} words
            {r.isPublished ? "" : " · not published"}
          </Text>
          {r.wordCount === 0 ? <Text style={styles.warn}>No words uploaded yet.</Text> : null}
          {r.missingPicture.length ? (
            <Text style={styles.warn}>
              Needs picture: {r.missingPicture.slice(0, 6).join(", ")}
              {r.missingPicture.length > 6 ? ` +${r.missingPicture.length - 6} more` : ""}
            </Text>
          ) : null}
          {r.missingMeaning.length ? (
            <Text style={styles.warn}>
              Needs meaning: {r.missingMeaning.slice(0, 6).join(", ")}
              {r.missingMeaning.length > 6 ? ` +${r.missingMeaning.length - 6} more` : ""}
            </Text>
          ) : null}
          {r.wordCount > 0 && r.noAudioFile.length ? (
            <Text style={styles.note}>
              🔊 {r.noAudioFile.length} word(s) have no audio file. The phone voice reads them aloud.
            </Text>
          ) : null}
        </View>
      ))}
      <Text style={styles.note}>
        A category can be published only when every word has a picture and a meaning.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#F1FAF3", borderRadius: 14, padding: 12, gap: 6 },
  section: { fontWeight: "800", fontSize: 15, color: colors.text },
  row: { gap: 2 },
  name: { fontWeight: "700", color: colors.text, fontSize: 13 },
  warn: { color: "#B54708", fontWeight: "700", fontSize: 12, marginLeft: 22 },
  note: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
});
