import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { AppError } from "../lib/errors.js";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      // Zod may load twice under Vitest/ESM — prefer AppError so status is always 400.
      if (err instanceof ZodError || (err as { name?: string })?.name === "ZodError") {
        const zodErr = err as ZodError;
        next(
          new AppError("Validation failed", 400, {
            code: "VALIDATION_FAILED",
            issues: zodErr.flatten?.() ?? zodErr.issues,
          })
        );
        return;
      }
      next(err);
    }
  };
}
