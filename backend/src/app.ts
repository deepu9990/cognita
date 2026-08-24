import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { allowedOrigins } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { conversationRouter } from "./routes/conversation.routes.js";

export const app = express();

const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow browser-less calls and local development ports.
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        callback(null, true);
        return;
      }
      if (
        configuredOrigins.includes(origin) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api", chatRouter);

app.use((_request, response) => {
  response.status(404).json({ success: false, error: "Route not found" });
});

app.use(errorHandler);
