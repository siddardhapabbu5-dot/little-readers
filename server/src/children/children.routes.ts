import { Router } from "express";
import { createChildSchema } from "@little-readers/validation";
import {
  createChild,
  getChildProgress,
  listChildrenForParent,
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

childrenRouter.get("/:id/progress", async (req: AuthenticatedRequest, res, next) => {
  try {
    const progress = await getChildProgress(req.user!.id, req.params.id);
    res.status(200).json({ data: progress });
  } catch (error) {
    next(error);
  }
});
