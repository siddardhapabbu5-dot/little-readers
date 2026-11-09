import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  createPairing,
  deletePairing,
  findPendingPairingByCode,
  getPairing,
  newTvAccessToken,
  normalizePairingCode,
  sha256,
} from "./tv.store.js";

export const TV_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TVS_PER_PARENT = 5;
const APPROVE_FAIL_LIMIT = 10;
const APPROVE_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;
/** Admins pair TVs only to their own Admin Practice learner. */
const TV_ACCOUNT_ROLES = new Set(["PARENT", "ADMIN", "SUPER_ADMIN"]);

export type TvSession = {
  id: string;
  parentId: string;
  childId: string;
  deviceLabel: string;
};

const approveFailures = new Map<string, { count: number; since: number }>();

function notConnected() {
  return new AppError("This TV is not connected. Please connect it again.", 401, {
    code: "TV_NOT_CONNECTED",
  });
}

function activeWhere(now = new Date()) {
  return { revokedAt: null, expiresAt: { gt: now } };
}

function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function startTvPairing(deviceLabel?: string) {
  const label = String(deviceLabel ?? "").trim().slice(0, 60) || "Television";
  const created = createPairing(label);
  if (!created) {
    throw new AppError("Too many TVs are pairing right now. Please try again in a minute.", 503);
  }
  return {
    pairingId: created.pairing.id,
    code: formatCode(created.pairing.code),
    pollToken: created.pollToken,
    expiresAt: new Date(created.pairing.expiresAt).toISOString(),
    pollIntervalMs: 3000,
  };
}

/** TV polls until a parent approves. The access token is handed out exactly once. */
export function pollTvPairing(pairingId: string, pollToken: string) {
  const pairing = getPairing(String(pairingId ?? ""));
  if (!pairing || pairing.pollTokenHash !== sha256(String(pollToken ?? ""))) {
    throw new AppError("This TV code has expired. Show a new code.", 410, {
      code: "PAIRING_EXPIRED",
    });
  }
  if (pairing.status === "PENDING" || !pairing.accessToken) {
    return { status: "PENDING" as const };
  }
  const accessToken = pairing.accessToken;
  deletePairing(pairing.id);
  return { status: "APPROVED" as const, accessToken };
}

function noteApproveFailure(parentId: string) {
  const now = Date.now();
  const row = approveFailures.get(parentId);
  if (!row || now - row.since > APPROVE_FAIL_WINDOW_MS) {
    approveFailures.set(parentId, { count: 1, since: now });
  } else {
    row.count += 1;
  }
}

function assertNotLockedOut(parentId: string) {
  const row = approveFailures.get(parentId);
  if (!row) return;
  if (Date.now() - row.since > APPROVE_FAIL_WINDOW_MS) {
    approveFailures.delete(parentId);
    return;
  }
  if (row.count >= APPROVE_FAIL_LIMIT) {
    throw new AppError("Too many wrong TV codes. Please wait 15 minutes and try again.", 429, {
      code: "PAIRING_LOCKED",
    });
  }
}

export async function approveTvPairing(parentId: string, rawCode: string, childId: string) {
  assertNotLockedOut(parentId);
  const code = normalizePairingCode(rawCode);
  const pairing = code.length === 8 ? findPendingPairingByCode(code) : null;
  if (!pairing) {
    noteApproveFailure(parentId);
    throw new AppError("That TV code is wrong or has expired. Check the code on the TV.", 404, {
      code: "PAIRING_NOT_FOUND",
    });
  }
  // Claim the code before any await so two approvals cannot both succeed.
  pairing.status = "APPROVED";

  try {
    const child = await prisma.child.findFirst({
      where: { id: String(childId ?? ""), parentId, isActive: true },
      select: { id: true, displayName: true },
    });
    if (!child) throw new AppError("Child not found", 404);

    const now = new Date();
    const active = await prisma.tvDeviceSession.findMany({
      where: { parentId, ...activeWhere(now) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const overflow = active.slice(0, Math.max(0, active.length - (MAX_TVS_PER_PARENT - 1)));
    if (overflow.length) {
      await prisma.tvDeviceSession.updateMany({
        where: { id: { in: overflow.map((r) => r.id) } },
        data: { revokedAt: now, revokedReason: "TV_LIMIT" },
      });
    }

    const accessToken = newTvAccessToken();
    const session = await prisma.tvDeviceSession.create({
      data: {
        parentId,
        childId: child.id,
        deviceLabel: pairing.deviceLabel,
        tokenHash: sha256(accessToken),
        expiresAt: new Date(now.getTime() + TV_SESSION_TTL_MS),
      },
      select: { id: true, deviceLabel: true },
    });
    pairing.accessToken = accessToken;
    approveFailures.delete(parentId);

    return {
      connectionId: session.id,
      childId: child.id,
      childName: child.displayName,
      deviceLabel: session.deviceLabel,
    };
  } catch (error) {
    pairing.status = "PENDING";
    throw error;
  }
}

/**
 * Resolve a TV bearer token. The parent account and child must still be active, and a
 * parent password reset after pairing disconnects the TV.
 */
export async function authenticateTvToken(token: string): Promise<TvSession> {
  if (!token) throw notConnected();
  const row = await prisma.tvDeviceSession.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      parentId: true,
      childId: true,
      deviceLabel: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      child: {
        select: {
          parentId: true,
          isActive: true,
          parent: { select: { isActive: true, role: true, passwordChangedAt: true } },
        },
      },
    },
  });
  const now = new Date();
  if (!row || row.revokedAt || row.expiresAt <= now) throw notConnected();

  const { child } = row;
  const parent = child.parent;
  const passwordReset = parent.passwordChangedAt && parent.passwordChangedAt > row.createdAt;
  if (
    child.parentId !== row.parentId ||
    !child.isActive ||
    !parent.isActive ||
    !TV_ACCOUNT_ROLES.has(parent.role) ||
    passwordReset
  ) {
    await prisma.tvDeviceSession.update({
      where: { id: row.id },
      data: { revokedAt: now, revokedReason: passwordReset ? "PASSWORD_RESET" : "ACCOUNT_INACTIVE" },
    });
    throw notConnected();
  }

  if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.tvDeviceSession.update({ where: { id: row.id }, data: { lastSeenAt: now } });
  }
  return { id: row.id, parentId: row.parentId, childId: row.childId, deviceLabel: row.deviceLabel };
}

export async function listTvConnections(parentId: string) {
  const rows = await prisma.tvDeviceSession.findMany({
    where: { parentId, ...activeWhere() },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      childId: true,
      deviceLabel: true,
      createdAt: true,
      lastSeenAt: true,
      child: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    childId: r.childId,
    childName: r.child.displayName,
    deviceLabel: r.deviceLabel,
    connectedAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));
}

export async function revokeTvConnection(parentId: string, connectionId: string) {
  const res = await prisma.tvDeviceSession.updateMany({
    where: { id: connectionId, parentId, ...activeWhere() },
    data: { revokedAt: new Date(), revokedReason: "PARENT_REVOKED" },
  });
  if (res.count === 0) throw new AppError("TV connection not found", 404);
  return { ok: true };
}

export async function disconnectTv(tv: TvSession) {
  await prisma.tvDeviceSession.updateMany({
    where: { id: tv.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "TV_DISCONNECTED" },
  });
  return { ok: true };
}

/** Learning sessions started on TV must belong to the paired child. */
export async function assertTvOwnsLearningSession(tv: TvSession, sessionId: string) {
  const row = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    select: { childId: true },
  });
  if (!row || row.childId !== tv.childId) throw new AppError("Session not found", 404);
}
