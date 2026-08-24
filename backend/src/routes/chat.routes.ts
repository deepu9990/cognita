import { Router } from "express";
import { chat, health, streamChat } from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const chatRouter = Router();

chatRouter.get("/health", health);
chatRouter.post("/chat", requireAuth, chat);
chatRouter.post("/chat/stream", requireAuth, streamChat);
