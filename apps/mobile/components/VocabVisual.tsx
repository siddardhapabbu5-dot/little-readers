import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { playOptionVisual } from "../services/emoji";
import { hasPilot3dImage } from "../services/pilot-3d";
import { colors } from "../theme";

type Props = {
  imageUrl?: string | null;
  emoji?: string | null;
  letter?: string | null;
  text?: string | null;
  /** Enables staging Batch D1 text-free 3D overlay when a pilot asset exists. */
  wordId?: string | null;
  size?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Listen MCQ: crop the lower band of educational PNGs that print the word on the asset.
   * Does not change source media files. Ignored when a text-free pilot 3D image is active.
   */
  hideAnswerBand?: boolean;
  /**
   * Listen MCQ: prefer emoji over flashcard PNGs that print the answer word in the artwork.
   * Images remain unused here only; topic / teach screens still show full pictures.
   * Ignored when a text-free pilot 3D image is active (show the pilot picture).
   */
  preferEmoji?: boolean;
};

/**
 * Child-facing vocab picture: remote image with emoji / letter fallback.
 * Used by Listen, Matching, Spell prompts, and topic preview.
 */
export function VocabVisual({
  imageUrl,
  emoji,
  letter,
  text,
  wordId,
  size = 72,
  accessibilityLabel,
  style,
  hideAnswerBand = false,
  preferEmoji = false,
}: Props) {
  const visual = playOptionVisual({ imageUrl, emoji, letter, text, wordId });
  const [failed, setFailed] = useState(false);
  const usingPilot = hasPilot3dImage(wordId);

  useEffect(() => {
    setFailed(false);
  }, [visual.imageUrl, visual.emoji, visual.letter]);

  const emojiCandidate =
    visual.emoji && visual.emoji !== "🔤" ? visual.emoji : emoji && emoji !== "🔤" ? emoji : null;
  // Pilot 3D assets are text-free — always prefer the picture over emoji hide.
  const forceEmoji = !usingPilot && preferEmoji && Boolean(emojiCandidate);
  const showImage = !forceEmoji && visual.kind === "image" && visual.imageUrl && !failed;
  const label = accessibilityLabel || text || visual.letter;
  const radius = Math.max(10, size / 6);
  const cropBand = hideAnswerBand && !usingPilot;

  if (showImage) {
    if (cropBand) {
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: radius,
              overflow: "hidden",
              backgroundColor: colors.skySoft,
            },
            style,
          ]}
          accessibilityLabel={label}
        >
          <Image
            source={{ uri: visual.imageUrl! }}
            style={{
              // Scale up and crop the lower flashcard band (printed word + meaning).
              width: size,
              height: Math.round(size * 1.42),
              marginTop: -Math.round(size * 0.06),
            }}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        </View>
      );
    }
    return (
      <Image
        source={{ uri: visual.imageUrl! }}
        style={[{ width: size, height: size, borderRadius: radius }, style as object]}
        resizeMode="contain"
        accessibilityLabel={label}
        onError={() => setFailed(true)}
      />
    );
  }

  const emojiMark = forceEmoji
    ? emojiCandidate
    : visual.kind === "emoji"
      ? visual.emoji
      : failed && visual.emoji && visual.emoji !== "🔤"
        ? visual.emoji
        : null;
  if (emojiMark) {
    return (
      <Text
        style={[styles.emoji, { fontSize: size * 0.72, lineHeight: size * 0.88 }]}
        accessibilityLabel={label}
      >
        {emojiMark}
      </Text>
    );
  }

  return (
    <View
      style={[
        styles.letterWrap,
        { width: size, height: size, borderRadius: Math.max(10, size / 6) },
        style,
      ]}
      accessibilityLabel={label}
    >
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{visual.letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: { textAlign: "center" },
  letterWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.skySoft,
  },
  letter: { fontWeight: "900", color: colors.text },
});
