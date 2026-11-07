import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createPolicyVersionLinkToken } from "../privacy/policy-documents.service.js";
import {
  acceptAgreements,
  assertPublishedVersion,
  getAgreementStatus,
} from "./agreements.service.js";

export const agreementsRouter = Router();

agreementsRouter.use(requireAuth, requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"));

agreementsRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json({ data: await getAgreementStatus(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

agreementsRouter.post(
  "/accept",
  validateBody(
    z.object({
      versionIds: z.array(z.string().min(1)).min(1).max(10),
      marketingOptIn: z.boolean().default(false),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await acceptAgreements(req.user!.id, req.body, {
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

agreementsRouter.post("/versions/:id/link", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await assertPublishedVersion(id);
    const { token, expiresInSec } = createPolicyVersionLinkToken(id);
    res.json({
      data: { path: `/privacy/documents/file?token=${encodeURIComponent(token)}`, expiresInSec },
    });
  } catch (e) {
    next(e);
  }
});
