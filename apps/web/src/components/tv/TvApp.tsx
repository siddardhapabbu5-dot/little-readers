"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TvGame, type TvGameKind } from "./TvGame";
import { TvPair } from "./TvPair";
import { getSoundOn, saveSoundOn, sayWord } from "./tv-audio";
import {
  clearTvToken,
  friendlyTvError,
  getTvToken,
  isNotConnected,
  tvRequest,
  type TvActivity,
  type TvCategory,
  type TvMe,
} from "./tv-api";
import { focusFirst, useRemote } from "./useRemote";

type Screen =
  | { name: "boot" }
  | { name: "pair" }
  | { name: "home" }
  | { name: "topics"; activity: TvActivity }
  | { name: "game"; activity: TvActivity; kind: TvGameKind; category: TvCategory }
  | { name: "confirm-disconnect" };

const COLORS: Record<string, string> = {
  LISTEN: "tv-c-blue",
  SPELL: "tv-c-orange",
  MATCH_IT: "tv-c-purple",
  QUIZ_TIME: "tv-c-red",
  SURPRISE: "tv-c-gold",
};

export function TvApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>({ name: "boot" });
  const [me, setMe] = useState<TvMe | null>(null);
  const [activities, setActivities] = useState<TvActivity[]>([]);
  const [topics, setTopics] = useState<TvCategory[]>([]);
  const [offline, setOffline] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const disconnected = useCallback(() => {
    clearTvToken();
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
      setScreen((s) => (s.name === "boot" || s.name === "pair" ? { name: "home" } : s));
    } catch (err) {
      if (isNotConnected(err)) return disconnected();
      setError(friendlyTvError(err));
      setScreen((s) => (s.name === "boot" ? { name: "home" } : s));
    }
  }, [disconnected]);

  useEffect(() => {
    setSoundOn(getSoundOn());
    if (getTvToken()) void loadHome();
    else setScreen({ name: "pair" });
  }, [loadHome]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Idle check so a TV the parent revoked returns to pairing without a button press.
  const idle = screen.name === "home" || screen.name === "topics";
  useEffect(() => {
    if (!idle) return;
    const timer = window.setInterval(() => {
      tvRequest<TvMe>("/me")
        .then(setMe)
        .catch((err) => {
          if (isNotConnected(err)) disconnected();
        });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [idle, disconnected]);

  // Move remote focus onto the new screen.
  useEffect(() => {
    if (screen.name === "game") return;
    window.requestAnimationFrame(() => focusFirst(rootRef.current));
  }, [screen, activities.length, topics.length, error]);

  const goHome = useCallback(() => {
    setScreen({ name: "home" });
    void loadHome();
  }, [loadHome]);

  useRemote(rootRef, () => {
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

  function openActivity(activity: TvActivity) {
    if (!activity.enabled) return;
    setScreen({ name: "topics", activity });
  }

  function openTopic(activity: TvActivity, category: TvCategory) {
    let kind: TvGameKind;
    if (activity.code === "SURPRISE") {
      const games = activities.filter(
        (a) => (a.code === "MATCH_IT" || a.code === "QUIZ_TIME") && a.enabled
      );
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
    saveSoundOn(next);
    if (next) sayWord("Sound on");
  }

  async function disconnectTv() {
    try {
      await tvRequest("/disconnect", { method: "POST" });
    } catch {
      /* token is cleared locally either way */
    }
    disconnected();
  }

  const childName = me?.child.displayName ?? "";
  const daily = me?.summary?.daily;

  return (
    <div className="tv-root" ref={rootRef}>
      <div className="tv-sky" aria-hidden>
        <span className="tv-cloud tv-cloud-1" />
        <span className="tv-cloud tv-cloud-2" />
        <span className="tv-cloud tv-cloud-3" />
      </div>

      {offline ? (
        <div className="tv-offline" role="alert">
          📡 No internet — your answers are kept and will be saved when Wi-Fi is back.
        </div>
      ) : null}

      <div className="tv-safe">
        {screen.name === "boot" ? (
          <div className="tv-center">
            <div className="tv-spinner" />
          </div>
        ) : null}

        {screen.name === "pair" ? <TvPair onPaired={() => void loadHome()} /> : null}

        {screen.name === "home" ? (
          <div className="tv-home tv-enter">
            <header className="tv-home-head">
              <h1 className="tv-brand">
                <span aria-hidden>📚</span> Learn Wise
              </h1>
              {me ? (
                <div className="tv-kid">
                  {me.child.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tv-avatar" src={me.child.avatarUrl} alt="" />
                  ) : (
                    <span className="tv-avatar tv-avatar-emoji">🧒</span>
                  )}
                  <div>
                    <p className="tv-kid-name">Hi, {childName}!</p>
                    <p className="tv-kid-meta">
                      ⭐ {me.summary?.points ?? 0} points
                      {daily ? (
                        <>
                          {" · "}
                          {daily.completed
                            ? "🎯 Daily goal done!"
                            : `🎯 Today ${daily.wordsLearnedToday}/${daily.target} words`}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              ) : null}
            </header>

            {error ? <p className="tv-error">{error}</p> : null}
            {me && !me.child.hasLearningSeat ? (
              <p className="tv-error">
                Learning is not active for {childName} yet. A parent can turn it on in the Learn Wise app.
              </p>
            ) : null}

            <p className="tv-ask">What shall we play?</p>
            <div className="tv-activities">
              {activities.map((a, i) => (
                <button
                  key={a.code}
                  type="button"
                  className={`tv-btn tv-activity ${COLORS[a.code] ?? ""}`}
                  data-tv
                  data-tv-autofocus={i === 0 ? "" : undefined}
                  disabled={!a.enabled}
                  onClick={() => openActivity(a)}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span className="tv-activity-emoji">{a.emoji}</span>
                  <span className="tv-activity-title">{a.title}</span>
                  <span className="tv-activity-desc">{a.enabled ? a.description : "Switched off"}</span>
                </button>
              ))}
            </div>

            <footer className="tv-home-foot">
              <button type="button" className="tv-btn tv-btn-soft tv-btn-small" data-tv onClick={toggleSound}>
                {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
              </button>
              <button
                type="button"
                className="tv-btn tv-btn-soft tv-btn-small"
                data-tv
                onClick={() => setScreen({ name: "confirm-disconnect" })}
              >
                📺 Disconnect TV
              </button>
            </footer>
          </div>
        ) : null}

        {screen.name === "topics" ? (
          <div className="tv-topics tv-enter">
            <header className="tv-game-head">
              <button
                type="button"
                className="tv-btn tv-btn-soft tv-btn-small"
                data-tv
                onClick={() => setScreen({ name: "home" })}
              >
                ◀ Activities
              </button>
              <h1 className="tv-game-title">
                <span aria-hidden>{screen.activity.emoji}</span> {screen.activity.title}
                <span className="tv-game-topic">Pick a topic</span>
              </h1>
              <div className="tv-game-stats" />
            </header>
            {error ? <p className="tv-error">{error}</p> : null}
            {topics.length === 0 ? (
              <p className="tv-lead">No topics are ready yet. Please check back soon!</p>
            ) : (
              <div className="tv-topic-grid">
                {topics.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className="tv-btn tv-topic"
                    data-tv
                    data-tv-autofocus={i === 0 ? "" : undefined}
                    disabled={!c.unlocked}
                    onClick={() => openTopic(screen.activity, c)}
                  >
                    <span className="tv-topic-emoji">{c.unlocked ? c.emoji : "🔒"}</span>
                    <span className="tv-topic-label">{c.label}</span>
                    <span className="tv-topic-meta">
                      {c.progress?.completed
                        ? "✅ Done"
                        : `${c.progress?.wordsLearned ?? 0}/${c.wordCount} words`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {screen.name === "game" ? (
          <TvGame
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
          <div className="tv-center tv-enter">
            <p className="tv-big-emoji">📺</p>
            <p className="tv-lead">Disconnect this TV from {childName || "this child"}?</p>
            <p className="tv-kid-meta">Learning progress stays saved. A parent can connect again any time.</p>
            <div className="tv-row">
              <button
                type="button"
                className="tv-btn tv-btn-soft"
                data-tv
                data-tv-autofocus
                onClick={() => setScreen({ name: "home" })}
              >
                No, keep learning
              </button>
              <button type="button" className="tv-btn tv-btn-danger" data-tv onClick={() => void disconnectTv()}>
                Yes, disconnect
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
