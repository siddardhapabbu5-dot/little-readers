import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { apiRequest, ApiError } from "../services/api";
import { getCachedAvatar, publishAvatar as publish, subscribeAvatar } from "../services/avatar-cache";
import { colors } from "../theme";

/** Current user's profile photo (shared across screens, fetched once per session). */
export function useMyAvatar() {
  const [url, setUrl] = useState<string | null>(getCachedAvatar() ?? null);
  useEffect(() => {
    const unsubscribe = subscribeAvatar(setUrl);
    if (getCachedAvatar() === undefined) {
      apiRequest<{ avatarUrl: string | null }>("/auth/me/avatar")
        .then((d) => publish(d.avatarUrl))
        .catch(() => undefined);
    }
    return unsubscribe;
  }, []);
  return url;
}

async function pickImage(source: "camera" | "gallery") {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };
  if (source === "camera") {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error("Camera permission is needed to take a photo.");
    }
    return ImagePicker.launchCameraAsync(options);
  }
  return ImagePicker.launchImageLibraryAsync(options);
}

/** Round profile photo with Camera / Gallery / Remove actions. */
export function ProfilePhoto({
  size = 72,
  editable = true,
  fallback = "👤",
}: {
  size?: number;
  editable?: boolean;
  fallback?: string;
}) {
  const url = useMyAvatar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(source: "camera" | "gallery") {
    setError(null);
    try {
      const result = await pickImage(source);
      if (result.canceled || !result.assets?.[0]) return;
      setBusy(true);
      const small = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!small.base64) throw new Error("Could not read the photo.");
      const image = `data:image/jpeg;base64,${small.base64}`;
      const saved = await apiRequest<{ avatarUrl: string | null }>("/auth/me/avatar", {
        method: "PUT",
        body: JSON.stringify({ image }),
      });
      publish(saved.avatarUrl);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("/auth/me/avatar", { method: "PUT", body: JSON.stringify({ image: null }) });
      publish(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove photo");
    } finally {
      setBusy(false);
    }
  }

  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.wrap, { width: Math.max(size + 24, 104) }]}>
      <View style={[styles.circle, circle]}>
        {url ? (
          <Image source={{ uri: url }} style={circle} accessibilityLabel="Profile photo" />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{fallback}</Text>
        )}
        {busy ? (
          <View style={[styles.busy, circle]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      {editable ? (
        <View style={styles.actions}>
          <Pressable style={styles.action} disabled={busy} onPress={() => void choose("camera")}>
            <Text style={styles.actionText}>📷 Camera</Text>
          </Pressable>
          <Pressable style={styles.action} disabled={busy} onPress={() => void choose("gallery")}>
            <Text style={styles.actionText}>🖼️ Gallery</Text>
          </Pressable>
          {url ? (
            <Pressable style={styles.action} disabled={busy} onPress={() => void remove()}>
              <Text style={[styles.actionText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Small read-only avatar: the photo if set, otherwise the given fallback. */
export function AvatarImage({ size, fallback }: { size: number; fallback: ReactNode }) {
  const url = useMyAvatar();
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return url ? (
    <Image source={{ uri: url }} style={circle} accessibilityLabel="Profile photo" />
  ) : (
    <>{fallback}</>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 8 },
  circle: {
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  busy: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { gap: 6, alignSelf: "stretch" },
  action: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: "center",
  },
  actionText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  error: { color: colors.danger, fontSize: 12, textAlign: "center", maxWidth: 220 },
});
