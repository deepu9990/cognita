import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { chatRouter } from "./routes/chat.routes.js";

dotenv.config();

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
      if (configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", chatRouter);

app.use((_request, response) => {
  response.status(404).json({ success: false, error: "Route not found" });
});
