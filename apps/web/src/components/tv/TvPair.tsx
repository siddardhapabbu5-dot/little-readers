"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ApiClientError } from "../../lib/api";
import {
  TV_CONNECT_URL,
  TvOfflineError,
  friendlyTvError,
  setTvToken,
  tvRequest,
} from "./tv-api";

type Pairing = {
  pairingId: string;
  code: string;
  pollToken: string;
  expiresAt: string;
  pollIntervalMs: number;
};

function tvDeviceLabel() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/GoogleTV|Google TV/i.test(ua)) return "Google TV";
  if (/Android/i.test(ua) && /TV|AFT|BRAVIA|SMART|Large Screen/i.test(ua)) return "Android TV";
  if (/SMART-TV|SmartTV|Tizen|Web0S|webOS/i.test(ua)) return "Smart TV";
  return "TV browser";
}

export function TvPair({ onPaired }: { onPaired: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pairingRef = useRef<Pairing | null>(null);

  const newCode = useCallback(async () => {
    setError(null);
    try {
      const next = await tvRequest<Pairing>("/pair/start", {
        method: "POST",
        auth: false,
        body: { deviceLabel: tvDeviceLabel() },
      });
      pairingRef.current = next;
      setPairing(next);
      setQr(
        await QRCode.toDataURL(`${TV_CONNECT_URL}/tv-connect?code=${next.code}`, {
          width: 520,
          margin: 1,
          errorCorrectionLevel: "M",
        })
      );
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
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pairing, newCode]);

  // Poll until the parent approves on the phone.
  useEffect(() => {
    if (!pairing) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
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
          setTvToken(res.accessToken);
          onPaired();
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 410) {
          if (!stopped) void newCode();
        } else if (err instanceof TvOfflineError) {
          setError(friendlyTvError(err));
        }
      }
    }, pairing.pollIntervalMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pairing, newCode, onPaired]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="tv-pair tv-enter">
      <section className="tv-pair-left">
        <h1 className="tv-brand tv-brand-big">
          <span aria-hidden>📚</span> Learn Wise
        </h1>
        <p className="tv-lead">Learn words on the big screen!</p>
        <ol className="tv-steps">
          <li>
            <span className="tv-step-num">1</span>
            <span>
              Open <b>Learn Wise</b> on the parent&apos;s phone
            </span>
          </li>
          <li>
            <span className="tv-step-num">2</span>
            <span>
              Go to <b>Profile → Connect a TV</b> and scan this code
            </span>
          </li>
          <li>
            <span className="tv-step-num">3</span>
            <span>
              Choose your child and tap <b>Connect TV</b>
            </span>
          </li>
        </ol>
        {error ? <p className="tv-error">{error}</p> : null}
        <button type="button" className="tv-btn tv-btn-soft" data-tv data-tv-autofocus onClick={() => void newCode()}>
          🔄 New code
        </button>
      </section>

      <section className="tv-pair-card">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tv-qr" src={qr} alt="QR code to connect this TV" />
        ) : (
          <div className="tv-qr tv-qr-empty">{error ? "⚠️" : "…"}</div>
        )}
        <p className="tv-code-label">Or type this code in the app</p>
        <p className="tv-code">{pairing?.code ?? "····-····"}</p>
        <p className="tv-code-timer">
          {pairing ? `Code changes in ${mm}:${ss}` : "Getting a code…"}
        </p>
      </section>
    </div>
  );
}
