import { Router } from "express";
import { authRouter } from "../auth/auth.routes.js";
import { childrenRouter } from "../children/children.routes.js";
import { learningRouter } from "../learning/learning.routes.js";
import { vocabImportRouter } from "../vocab-import/vocab-import.routes.js";
import { dictionaryRouter } from "../dictionary/dictionary.routes.js";
import { contentStructureRouter } from "../content-structure/content-structure.routes.js";
import { lessonAdminRouter } from "../lessons/lesson.routes.js";
import { programmeRouter } from "../programmes/programme.routes.js";
import { publisherRouter } from "../programmes/publisher.routes.js";
import {
  deviceRouter,
  subscriptionRouter,
} from "../devices/device.routes.js";
import {
  schoolAdminRouter,
  teacherRouter,
} from "../schools/school.routes.js";
import { adminUsersRouter } from "../admin-users/admin-users.routes.js";
import {
  privacyAdminRouter,
  privacyPublicRouter,
} from "../privacy/privacy.routes.js";
import {
  paymentsRouter,
  paymentsWebhookHandler,
} from "../payments/payment.routes.js";
import { getChildLearningOverview } from "../learning/learning.service.js";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { parentAuthRouter } from "../parent-auth/parent-auth.routes.js";
import { adminParentSessionsRouter } from "../parent-auth/admin-parent-sessions.routes.js";
import { adminAuthRouter } from "../admin-auth/admin-auth.routes.js";
import {
  academicAdminRouter,
  academicParentRouter,
} from "../academic/academic.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    data: {
      status: "ok",
      service: "little-readers-api",
      phase: 1,
      timestamp: new Date().toISOString(),
    },
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/parent/auth", parentAuthRouter);
apiRouter.use("/admin/auth", adminAuthRouter);
apiRouter.use("/admin/parents", adminParentSessionsRouter);
apiRouter.use("/admin/academic", academicAdminRouter);
apiRouter.use("/parent/catalog", academicParentRouter);
apiRouter.use("/children", childrenRouter);
apiRouter.use("/learning", learningRouter);
apiRouter.use("/admin/vocabulary", vocabImportRouter);
apiRouter.use("/admin/dictionary", dictionaryRouter);
apiRouter.use("/admin/content", contentStructureRouter);
apiRouter.use("/admin/lessons", lessonAdminRouter);
apiRouter.use("/admin/programmes", programmeRouter);
apiRouter.use("/admin/publisher", publisherRouter);
apiRouter.use("/admin/schools", schoolAdminRouter);
apiRouter.use("/admin/users", adminUsersRouter);
apiRouter.use("/privacy", privacyPublicRouter);
apiRouter.use("/admin/privacy", privacyAdminRouter);
apiRouter.use("/teacher", teacherRouter);
apiRouter.use("/devices", deviceRouter);
apiRouter.use("/subscriptions", subscriptionRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.post("/payments/webhook", paymentsWebhookHandler);

apiRouter.get(
  "/parent/dashboard",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.query.childId ?? "");
      if (!childId) {
        res.status(400).json({ error: "childId query parameter is required" });
        return;
      }
      const data = await getChildLearningOverview(
        req.user!.id,
        childId,
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

// Incomplete product surfaces — auth required; never mock success (Phase 10C).
const phaseStub =
  (feature: string, phase: number) =>
  (_req: AuthenticatedRequest, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(501).json({
      error: `${feature} is not available yet`,
      code: "FEATURE_NOT_READY",
      phase,
    });
  };

apiRouter.post(
  "/reading/attempt",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  phaseStub("Reading attempts", 3)
);
apiRouter.post(
  "/spelling/attempt",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  phaseStub("Spelling attempts", 4)
);
apiRouter.post(
  "/speech/assess",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  phaseStub("Speech assessment", 5)
);
/** Legacy stubs replaced by /payments/* (Batch 10). Keep paths for old clients. */
apiRouter.post("/subscriptions/verify", (_req, res) => {
  res.status(410).json({
    error: "Use POST /api/payments/verify after Razorpay checkout",
    code: "USE_PAYMENTS_VERIFY",
  });
});
apiRouter.get("/subscriptions/status", (_req, res) => {
  res.status(410).json({
    error: "Use GET /api/subscriptions/me for entitlement status",
    code: "USE_SUBSCRIPTIONS_ME",
  });
});
