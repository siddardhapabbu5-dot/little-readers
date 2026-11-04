import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  const configuredOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (mobile native / curl) send no Origin.
        if (!origin) {
          callback(null, true);
          return;
        }
        const isLocalExpo =
          env.NODE_ENV !== "production" &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (configuredOrigins.includes(origin) || isLocalExpo) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );
  // Capture raw body for Razorpay webhook HMAC (must run before general JSON parser).
  app.use(
    "/api/payments/webhook",
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => {
    res.status(200).json({
      service: "little-readers-api",
      status: "ok",
      message: "API is running. Use /api routes from the web app.",
      health: "/api/health",
      webApp: "http://localhost:3100",
    });
  });

  // Local Expo / web preview hammers APIs on every tab focus — keep prod limits only.
  const rateMax =
    env.NODE_ENV === "production" ? env.RATE_LIMIT_MAX : Math.max(env.RATE_LIMIT_MAX, 5000);
  app.use(
    "/api",
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: rateMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests, please try again later" },
      skip: () => process.env.VITEST === "true" || process.env.NODE_ENV === "test",
    })
  );

  app.use("/api", apiRouter);

  // Webhook registered on apiRouter; rawBody attached above for this path.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
