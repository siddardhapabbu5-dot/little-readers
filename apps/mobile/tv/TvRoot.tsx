import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Image, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  clearTvAccessToken,
  getTvAccessToken,
  getTvSoundOn,
  saveTvSoundOn,
} from "../services/secure";
import { TvGameScreen, type TvGameKind } from "./TvGameScreen";
import { TvPairScreen } from "./TvPairScreen";
import { sayWord, setTvSound } from "./tv-audio";
import {
  friendlyTvError,
  isNotConnected,
  tvRequest,
  type TvActivity,
  type TvCategory,
  type TvMe,
} from "./tv-api";
import { TvBackground, TvButton, tvColors, useTvScale } from "./ui";

type Screen =
  | { name: "boot" }
  | { name: "pair" }
  | { name: "home" }
  | { name: "topics"; activity: TvActivity }
  | { name: "game"; activity: TvActivity; kind: TvGameKind; category: TvCategory }
  | { name: "confirm-disconnect" };

const TILE_COLORS: Record<string, string> = {
  LISTEN: "#3B82F6",
  SPELL: "#F97316",
  MATCH_IT: "#A855F7",
  QUIZ_TIME: "#F43F5E",
  SURPRISE: "#EAB308",
};

/** Android TV / Google TV experience: one paired child, remote-only, no parent tools. */
export function TvRoot() {
  const s = useTvScale();
  const [screen, setScreen] = useState<Screen>({ name: "boot" });
  const [me, setMe] = useState<TvMe | null>(null);
  const [activities, setActivities] = useState<TvActivity[]>([]);
  const [topics, setTopics] = useState<TvCategory[]>([]);
  const [offline, setOffline] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const disconnected = useCallback(() => {
    void clearTvAccessToken();
    setMe(null);
    setScreen({ name: "pair" });
  }, []);

  const loadHome = useCallback(async () => {
    setError(null);
    try {
      const [profile, acts, cats] = await Promise.all([
        tvRequest<TvMe>("/me"),
        tvRequest<TvActivity[]>("/activities"),
        tvRequest<{ categories: TvCategory[] }>("/categories"),
      ]);
      setMe(profile);
      setActivities(acts);
      setTopics(cats.categories);
      setOffline(false);
      setScreen((sc) => (sc.name === "boot" || sc.name === "pair" ? { name: "home" } : sc));
    } catch (err) {
      if (isNotConnected(err)) return disconnected();
      setError(friendlyTvError(err));
      setScreen((sc) => (sc.name === "boot" ? { name: "home" } : sc));
    }
  }, [disconnected]);

  useEffect(() => {
    void (async () => {
      const on = await getTvSoundOn();
      setSoundOn(on);
      setTvSound(on);
      if (await getTvAccessToken()) void loadHome();
      else setScreen({ name: "pair" });
    })();
  }, [loadHome]);

  // Idle check so a TV the parent revoked returns to pairing without a button press.
  const idle = screen.name === "home" || screen.name === "topics";
  useEffect(() => {
    if (!idle) return;
    const timer = setInterval(() => {
      tvRequest<TvMe>("/me")
        .then(setMe)
        .catch((err) => {
          if (isNotConnected(err)) disconnected();
        });
    }, 60_000);
    return () => clearInterval(timer);
  }, [idle, disconnected]);

  const goHome = useCallback(() => {
    setScreen({ name: "home" });
    void loadHome();
  }, [loadHome]);

  // Remote Back: step back inside the TV app; on the home or pairing screen let Android exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name === "topics" || screen.name === "confirm-disconnect") {
        setScreen({ name: "home" });
        return true;
      }
      if (screen.name === "game") {
        goHome();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen.name, goHome]);

  function openTopic(activity: TvActivity, category: TvCategory) {
    let kind: TvGameKind;
    if (activity.code === "SURPRISE") {
      const games = activities.filter((a) => (a.code === "MATCH_IT" || a.code === "QUIZ_TIME") && a.enabled);
      if (!games.length) {
        setError("No games are switched on right now.");
        return;
      }
      kind = games[Math.floor(Math.random() * games.length)].code as TvGameKind;
    } else {
      kind = activity.code as TvGameKind;
    }
    setScreen({ name: "game", activity, kind, category });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setTvSound(next);
    void saveTvSoundOn(next);
    if (next) sayWord("Sound on");
  }

  async function disconnectTv() {
    try {
      await tvRequest("/disconnect", { method: "POST" });
    } catch {
      // The token is cleared locally either way.
    }
    disconnected();
  }

  const childName = me?.child.displayName ?? "";
  const daily = me?.summary?.daily;
  const lead = { fontSize: s(22), fontWeight: "800" as const, color: tvColors.ink, textAlign: "center" as const };
  const errorText = error ? (
    <Text style={{ fontSize: s(18), fontWeight: "800", color: tvColors.orange }}>{error}</Text>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar hidden />
      <TvBackground>
        {offline ? (
          <View style={{ backgroundColor: "#C2410C", paddingVertical: s(8), alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: s(18), fontWeight: "900" }}>
              📡 No internet — your answers are kept and will be saved when Wi-Fi is back.
            </Text>
          </View>
        ) : null}

        {/* TV overscan safe area: keep content away from the screen edges. */}
        <View style={{ flex: 1, paddingVertical: s(27), paddingHorizontal: s(48) }}>
          {screen.name === "boot" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={tvColors.blue} />
            </View>
          ) : null}

          {screen.name === "pair" ? <TvPairScreen onPaired={() => void loadHome()} /> : null}

          {screen.name === "home" ? (
            <View style={{ flex: 1, gap: s(12) }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: s(34), fontWeight: "900", color: tvColors.blue }}>📚 Learn Wise</Text>
                {me ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(12),
                      backgroundColor: "rgba(255,255,255,0.85)",
                      borderRadius: s(40),
                      paddingVertical: s(6),
                      paddingLeft: s(6),
                      paddingRight: s(20),
                    }}
                  >
                    {me.child.avatarUrl ? (
                      <Image source={{ uri: me.child.avatarUrl }} style={{ width: s(48), height: s(48), borderRadius: s(24) }} />
                    ) : (
                      <Text style={{ fontSize: s(36) }}>🧒</Text>
                    )}
                    <View>
                      <Text style={{ fontSize: s(22), fontWeight: "900", color: tvColors.ink }}>Hi, {childName}!</Text>
                      <Text style={{ fontSize: s(15), fontWeight: "800", color: tvColors.muted }}>
                        ⭐ {me.summary?.points ?? 0} points
                        {daily
                          ? daily.completed
                            ? " · 🎯 Daily goal done!"
                            : ` · 🎯 Today ${daily.wordsLearnedToday}/${daily.target} words`
                          : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {errorText}
              {me && !me.child.hasLearningSeat ? (
                <Text style={{ fontSize: s(18), fontWeight: "800", color: tvColors.orange }}>
                  Learning is not active for {childName} yet. A parent can turn it on in the Learn Wise app.
                </Text>
              ) : null}

              <Text style={{ fontSize: s(24), fontWeight: "900", color: "#312E81" }}>What shall we play?</Text>
              <View style={{ flex: 1, flexDirection: "row", gap: s(16) }}>
                {activities.map((a, i) => (
                  <TvButton
                    key={a.code}
                    preferred={i === 0}
                    disabled={!a.enabled}
                    onPress={() => setScreen({ name: "topics", activity: a })}
                    accessibilityLabel={a.title}
                    style={{ flex: 1, backgroundColor: TILE_COLORS[a.code] ?? "#3B82F6", borderRadius: s(24) }}
                  >
                    <View style={{ alignItems: "center", gap: s(8) }}>
                      <Text style={{ fontSize: s(60) }}>{a.emoji}</Text>
                      <Text style={{ fontSize: s(26), fontWeight: "900", color: "#fff", textAlign: "center" }}>
                        {a.title}
                      </Text>
                      <Text style={{ fontSize: s(14), fontWeight: "700", color: "#fff", textAlign: "center" }}>
                        {a.enabled ? a.description : "Switched off"}
                      </Text>
                    </View>
                  </TvButton>
                ))}
              </View>

              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s(16) }}>
                <TvButton label={soundOn ? "🔊 Sound on" : "🔇 Sound off"} onPress={toggleSound} textStyle={{ fontSize: s(16) }} />
                <TvButton
                  label="📺 Disconnect TV"
                  onPress={() => setScreen({ name: "confirm-disconnect" })}
                  textStyle={{ fontSize: s(16) }}
                />
              </View>
            </View>
          ) : null}

          {screen.name === "topics" ? (
            <View style={{ flex: 1, gap: s(12) }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(16) }}>
                <TvButton label="◀ Activities" onPress={() => setScreen({ name: "home" })} textStyle={{ fontSize: s(16) }} />
                <Text style={{ fontSize: s(28), fontWeight: "900", color: tvColors.ink }}>
                  {screen.activity.emoji} {screen.activity.title}
                  <Text style={{ fontSize: s(18), color: tvColors.muted }}>{"  "}Pick a topic</Text>
                </Text>
              </View>
              {errorText}
              {topics.length === 0 ? (
                <Text style={lead}>No topics are ready yet. Please check back soon!</Text>
              ) : (
                <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: s(16), padding: s(8) }}>
                  {topics.map((c, i) => (
                    <TvButton
                      key={c.id}
                      preferred={i === 0}
                      disabled={!c.unlocked}
                      onPress={() => openTopic(screen.activity, c)}
                      accessibilityLabel={c.label}
                      style={{ width: s(196), height: s(150), borderRadius: s(20) }}
                    >
                      <View style={{ alignItems: "center", gap: s(4) }}>
                        <Text style={{ fontSize: s(46) }}>{c.unlocked ? c.emoji : "🔒"}</Text>
                        <Text
                          style={{ fontSize: s(18), fontWeight: "900", color: tvColors.ink, textAlign: "center" }}
                          numberOfLines={2}
                        >
                          {c.label}
                        </Text>
                        <Text style={{ fontSize: s(14), fontWeight: "700", color: tvColors.muted }}>
                          {c.progress?.completed ? "✅ Done" : `${c.progress?.wordsLearned ?? 0}/${c.wordCount} words`}
                        </Text>
                      </View>
                    </TvButton>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          {screen.name === "game" ? (
            <TvGameScreen
              key={`${screen.category.id}-${screen.kind}`}
              kind={screen.kind}
              surprise={screen.activity.code === "SURPRISE"}
              title={screen.activity.code === "SURPRISE" ? "Surprise Game" : screen.activity.title}
              emoji={screen.activity.emoji}
              category={screen.category}
              onExit={goHome}
              onOffline={setOffline}
              onDisconnected={disconnected}
            />
          ) : null}

          {screen.name === "confirm-disconnect" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: s(16) }}>
              <Text style={{ fontSize: s(70) }}>📺</Text>
              <Text style={lead}>Disconnect this TV from {childName || "this child"}?</Text>
              <Text style={{ fontSize: s(16), fontWeight: "700", color: tvColors.muted }}>
                Learning progress stays saved. A parent can connect again any time.
              </Text>
              <View style={{ flexDirection: "row", gap: s(20) }}>
                <TvButton label="No, keep learning" preferred onPress={() => setScreen({ name: "home" })} />
                <TvButton label="Yes, disconnect" tone="danger" onPress={() => void disconnectTv()} />
              </View>
            </View>
          ) : null}
        </View>
      </TvBackground>
    </View>
  );
}
