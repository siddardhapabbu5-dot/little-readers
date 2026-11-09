import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { ApiError } from "../services/api";
import { saveTvAccessToken } from "../services/secure";
import { QrCode } from "./QrCode";
import {
  TV_CONNECT_URL,
  TvOfflineError,
  friendlyTvError,
  tvRequest,
  type TvPairing,
} from "./tv-api";
import { TvButton, tvColors, useTvScale } from "./ui";

function tvDeviceLabel() {
  const c = Platform.constants as { Brand?: string; Model?: string };
  const model = [c.Brand, c.Model].filter(Boolean).join(" ").trim();
  return model ? `Android TV (${model})`.slice(0, 60) : "Android TV";
}

export function TvPairScreen({ onPaired }: { onPaired: () => void }) {
  const s = useTvScale();
  const [pairing, setPairing] = useState<TvPairing | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pairingRef = useRef<TvPairing | null>(null);

  const newCode = useCallback(async () => {
    setError(null);
    try {
      const next = await tvRequest<TvPairing>("/pair/start", {
        method: "POST",
        auth: false,
        body: { deviceLabel: tvDeviceLabel() },
      });
      pairingRef.current = next;
      setPairing(next);
    } catch (err) {
      pairingRef.current = null;
      setPairing(null);
      setError(friendlyTvError(err));
    }
  }, []);

  useEffect(() => {
    void newCode();
  }, [newCode]);

  // Countdown, and a fresh code when this one expires.
  useEffect(() => {
    if (!pairing) return;
    const tick = () => {
      const left = Math.max(0, Math.round((Date.parse(pairing.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) void newCode();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pairing, newCode]);

  // Poll until the parent approves on the phone.
  useEffect(() => {
    if (!pairing) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const current = pairingRef.current;
      if (!current || stopped) return;
      try {
        const res = await tvRequest<{ status: "PENDING" | "APPROVED"; accessToken?: string }>(
          "/pair/poll",
          { method: "POST", auth: false, body: { pairingId: current.pairingId, pollToken: current.pollToken } }
        );
        setError(null);
        if (res.status === "APPROVED" && res.accessToken && !stopped) {
          stopped = true;
          await saveTvAccessToken(res.accessToken);
          onPaired();
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          if (!stopped) void newCode();
        } else if (err instanceof TvOfflineError) {
          setError(friendlyTvError(err));
        }
      }
    }, pairing.pollIntervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pairing, newCode, onPaired]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const steps = [
    "Open Learn Wise on the parent's phone",
    "Go to Profile → Connect a TV and scan this code",
    "Choose your child and tap Connect TV",
  ];

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: s(40) }}>
      <View style={{ flex: 1.1, gap: s(16) }}>
        <Text style={{ fontSize: s(52), fontWeight: "900", color: tvColors.blue }}>📚 Learn Wise</Text>
        <Text style={{ fontSize: s(24), fontWeight: "800", color: tvColors.ink }}>
          Learn words on the big screen!
        </Text>
        {steps.map((step, i) => (
          <View key={step} style={{ flexDirection: "row", alignItems: "center", gap: s(14) }}>
            <View
              style={{
                width: s(40),
                height: s(40),
                borderRadius: s(20),
                backgroundColor: "#F97316",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: s(20), fontWeight: "900" }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: s(20), fontWeight: "700", color: tvColors.ink }}>{step}</Text>
          </View>
        ))}
        {error ? <Text style={{ fontSize: s(18), fontWeight: "800", color: tvColors.orange }}>{error}</Text> : null}
        <View style={{ flexDirection: "row" }}>
          <TvButton label="🔄 New code" preferred onPress={() => void newCode()} />
        </View>
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: s(24),
          padding: s(24),
          alignItems: "center",
          gap: s(8),
          elevation: 6,
        }}
      >
        {pairing ? (
          <QrCode value={`${TV_CONNECT_URL}/tv-connect?code=${pairing.code}`} size={s(250)} />
        ) : (
          <View style={{ width: s(250), height: s(250), alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: s(40) }}>{error ? "⚠️" : "…"}</Text>
          </View>
        )}
        <Text style={{ fontSize: s(16), fontWeight: "800", color: tvColors.muted }}>
          Or type this code in the app
        </Text>
        <Text style={{ fontSize: s(44), fontWeight: "900", color: tvColors.blue, letterSpacing: s(4) }}>
          {pairing?.code ?? "····-····"}
        </Text>
        <Text style={{ fontSize: s(16), fontWeight: "700", color: tvColors.muted }}>
          {pairing ? `Code changes in ${mm}:${ss}` : "Getting a code…"}
        </Text>
      </View>
    </View>
  );
}
