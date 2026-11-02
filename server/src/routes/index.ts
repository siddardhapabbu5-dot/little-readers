import { Router } from "express";
import { authRouter } from "../auth/auth.routes.js";
import { childrenRouter } from "../children/children.routes.js";

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

// Phase stubs — return clear Phase 1 messages (no empty silent failures)
const phaseStub =
  (feature: string, phase: number) =>
  (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(501).json({
      error: `${feature} will be implemented in Phase ${phase}`,
      phase: 1,
    });
  };

apiRouter.get("/lessons", phaseStub("Lessons", 3));
apiRouter.post("/reading/attempt", phaseStub("Reading attempts", 3));
apiRouter.post("/spelling/attempt", phaseStub("Spelling attempts", 4));
apiRouter.post("/speech/assess", phaseStub("Speech assessment", 5));
apiRouter.get("/parent/dashboard", phaseStub("Parent dashboard API", 6));
apiRouter.post("/subscriptions/verify", phaseStub("Subscription verification", 8));
apiRouter.get("/subscriptions/status", phaseStub("Subscription status", 8));
apiRouter.post("/admin/lessons", phaseStub("Admin lesson create", 7));
apiRouter.put("/admin/lessons/:id", phaseStub("Admin lesson update", 7));
apiRouter.delete("/admin/lessons/:id", phaseStub("Admin lesson delete", 7));
