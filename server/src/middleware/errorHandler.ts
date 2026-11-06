import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Duck-type ZodError: duplicate zod copies break `instanceof` under Vitest/ESM.
  if (
    err instanceof ZodError ||
    (err &&
      typeof err === "object" &&
      (err as { name?: string }).name === "ZodError")
  ) {
    const zodErr = err as ZodError;
    return res.status(400).json({
      error: "Validation failed",
      details: typeof zodErr.flatten === "function" ? zodErr.flatten() : zodErr,
    });
  }

  if (err instanceof AppError) {
    const details = err.details;
    const code =
      details &&
      typeof details === "object" &&
      details !== null &&
      "code" in details &&
      typeof (details as { code: unknown }).code === "string"
        ? (details as { code: string }).code
        : undefined;
    return res.status(err.statusCode).json({
      error: err.message,
      ...(code ? { code } : {}),
      details: err.details,
    });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
