import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { validateBody } from "../middleware/validate.js";
import {
  createAdminUser,
  listPlatformUsers,
  setUserActiveStatus,
} from "./admin-users.service.js";

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requirePermission("users.manage"));

adminUsersRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
          ? false
          : undefined;
    const data = await listPlatformUsers(req.user!, { q, role, isActive });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.post(
  "/:userId/deactivate",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await setUserActiveStatus(
        req.user!,
        String(req.params.userId),
        false
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

adminUsersRouter.post(
  "/:userId/activate",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await setUserActiveStatus(
        req.user!,
        String(req.params.userId),
        true
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

adminUsersRouter.post(
  "/",
  requirePermission("admins.manage"),
  validateBody(
    z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(8).max(72),
      role: z.enum(["ADMIN", "SCHOOL_ADMIN"]),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await createAdminUser(req.user!, req.body);
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);
