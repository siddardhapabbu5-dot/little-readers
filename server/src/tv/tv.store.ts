import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * In-memory TV pairing codes (single API process, see ecosystem.config.cjs). Codes live
 * five minutes, so a restart only asks a TV that is mid-pairing for a new code.
 * Approved TV connections are stored in the TvDeviceSession table.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_PAIRINGS = 2000;

export type TvPairing = {
  id: string;
  code: string;
  pollTokenHash: string;
  deviceLabel: string;
  createdAt: number;
  expiresAt: number;
  status: "PENDING" | "APPROVED";
  /** Plain TV access token, held only until the TV claims it once. */
  accessToken?: string;
};

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newTvAccessToken() {
  return randomBytes(48).toString("base64url");
}

export function normalizePairingCode(raw: string) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function newCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const pairings = new Map<string, TvPairing>();
const pairingIdByCode = new Map<string, string>();

function sweep(now = Date.now()) {
  for (const [id, p] of pairings) {
    if (p.expiresAt <= now) {
      pairings.delete(id);
      pairingIdByCode.delete(p.code);
    }
  }
}

export function createPairing(deviceLabel: string) {
  sweep();
  if (pairings.size >= MAX_PENDING_PAIRINGS) return null;
  let code = newCode();
  while (pairingIdByCode.has(code)) code = newCode();
  const pollToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const pairing: TvPairing = {
    id: `tvp_${randomBytes(12).toString("hex")}`,
    code,
    pollTokenHash: sha256(pollToken),
    deviceLabel,
    createdAt: now,
    expiresAt: now + PAIRING_TTL_MS,
    status: "PENDING",
  };
  pairings.set(pairing.id, pairing);
  pairingIdByCode.set(code, pairing.id);
  return { pairing, pollToken };
}

export function getPairing(id: string) {
  sweep();
  return pairings.get(id) ?? null;
}

export function findPendingPairingByCode(code: string) {
  sweep();
  const id = pairingIdByCode.get(code);
  const p = id ? pairings.get(id) : undefined;
  return p && p.status === "PENDING" ? p : null;
}

export function deletePairing(id: string) {
  const p = pairings.get(id);
  if (!p) return;
  pairings.delete(id);
  pairingIdByCode.delete(p.code);
}

/** Test helper. */
export function resetTvStore() {
  pairings.clear();
  pairingIdByCode.clear();
}
