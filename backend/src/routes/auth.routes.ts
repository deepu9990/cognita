import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  googleCallbackHandler,
  googleRedirectHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  signupHandler,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many attempts. Please try again later.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const authRouter = Router();

authRouter.post("/signup", credentialLimiter, signupHandler);
authRouter.post("/login", credentialLimiter, loginHandler);
authRouter.post("/refresh", refreshLimiter, refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
authRouter.get("/google", googleRedirectHandler);
authRouter.get("/google/callback", googleCallbackHandler);
