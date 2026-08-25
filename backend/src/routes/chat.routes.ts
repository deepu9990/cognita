import { Router } from "express";
import { chat, health, models, streamChat } from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const chatRouter = Router();

chatRouter.get("/health", health);
chatRouter.get("/models", requireAuth, models);
chatRouter.post("/chat", requireAuth, chat);
chatRouter.post("/chat/stream", requireAuth, streamChat);
