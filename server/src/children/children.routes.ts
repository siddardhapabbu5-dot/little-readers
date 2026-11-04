import { Router } from "express";
import { createChildSchema, updateChildSchema } from "@little-readers/validation";
import {
  createChild,
  getChildProfile,
  getChildProgress,
  listChildrenForParent,
  listParentsForAdmin,
  softDeleteChild,
  updateChild,
} from "./children.service.js";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const childrenRouter = Router();

childrenRouter.use(requireAuth, requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"));

childrenRouter.post("/", validateBody(createChildSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const child = await createChild(req.user!.id, req.body);
    res.status(201).json({ data: child });
  } catch (error) {
    next(error);
  }
});

childrenRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const children = await listChildrenForParent(req.user!.id);
    res.status(200).json({ data: children });
  } catch (error) {
    next(error);
  }
});

/** Admin directory of parent accounts (not available to PARENT). */
childrenRouter.get(
  "/admin/parents",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.status(200).json({ data: await listParentsForAdmin() });
    } catch (error) {
      next(error);
    }
  }
);

childrenRouter.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await getChildProfile(
      req.user!.id,
      req.user!.role,
      String(req.params.id)
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

childrenRouter.get("/:id/progress", async (req: AuthenticatedRequest, res, next) => {
  try {
    const progress = await getChildProgress(
      req.user!.id,
      req.user!.role,
      String(req.params.id)
    );
    res.status(200).json({ data: progress });
  } catch (error) {
    next(error);
  }
});

childrenRouter.patch(
  "/:id",
  validateBody(updateChildSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await updateChild(
        req.user!.id,
        req.user!.role,
        String(req.params.id),
        req.body
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

childrenRouter.delete("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await softDeleteChild(
      req.user!.id,
      req.user!.role,
      String(req.params.id)
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});
