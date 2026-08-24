import { Router } from "express";
import {
  deleteAllHandler,
  deleteHandler,
  detailHandler,
  listHandler,
  renameHandler,
} from "../controllers/conversation.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

conversationRouter.get("/", listHandler);
conversationRouter.delete("/", deleteAllHandler);
conversationRouter.get("/:id", detailHandler);
conversationRouter.patch("/:id", renameHandler);
conversationRouter.delete("/:id", deleteHandler);
