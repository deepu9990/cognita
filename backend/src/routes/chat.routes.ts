import { Router } from "express";
import { chat, health, streamChat } from "../controllers/chat.controller.js";

export const chatRouter = Router();

chatRouter.get("/health", health);
chatRouter.post("/chat", chat);
chatRouter.post("/chat/stream", streamChat);
