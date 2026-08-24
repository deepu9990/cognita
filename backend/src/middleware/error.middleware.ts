import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      error: error.issues[0]?.message ?? "Invalid request payload.",
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      success: false,
      error: error.message,
    });
    return;
  }

  console.error("Unhandled error:", error);
  response.status(500).json({
    success: false,
    error: isProduction
      ? "Something went wrong."
      : ((error as Error)?.message ?? "Something went wrong."),
  });
}
