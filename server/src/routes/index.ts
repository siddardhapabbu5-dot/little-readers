import { Router } from "express";
import { authRouter } from "../auth/auth.routes.js";
import { childrenRouter } from "../children/children.routes.js";
import { learningRouter } from "../learning/learning.routes.js";
import { vocabImportRouter } from "../vocab-import/vocab-import.routes.js";
import { dictionaryRouter } from "../dictionary/dictionary.routes.js";
import { contentStructureRouter } from "../content-structure/content-structure.routes.js";
import { lessonAdminRouter } from "../lessons/lesson.routes.js";
import {
  deviceRouter,
  subscriptionRouter,
} from "../devices/device.routes.js";
import {
  schoolAdminRouter,
  teacherRouter,
} from "../schools/school.routes.js";
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
apiRouter.use("/children", childrenRouter);
apiRouter.use("/learning", learningRouter);
apiRouter.use("/admin/vocabulary", vocabImportRouter);
apiRouter.use("/admin/dictionary", dictionaryRouter);
apiRouter.use("/admin/content", contentStructureRouter);
apiRouter.use("/admin/lessons", lessonAdminRouter);
apiRouter.use("/admin/schools", schoolAdminRouter);
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

// Phase stubs — return clear Phase 1 messages (no empty silent failures)
const phaseStub =
  (feature: string, phase: number) =>
  (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(501).json({
      error: `${feature} will be implemented in Phase ${phase}`,
      phase: 1,
    });
  };

apiRouter.post("/reading/attempt", phaseStub("Reading attempts", 3));
apiRouter.post("/spelling/attempt", phaseStub("Spelling attempts", 4));
apiRouter.post("/speech/assess", phaseStub("Speech assessment", 5));
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
