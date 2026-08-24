import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { User, type UserDocument } from "../models/user.model.js";
import { HttpError } from "../utils/httpError.js";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

function createClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function createState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
  return createClient().generateAuthUrl({
    access_type: "offline",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
    code_challenge_method: "S256" as never,
    code_challenge: codeChallenge,
  });
}

export async function exchangeCodeForProfile(
  code: string,
  codeVerifier: string,
): Promise<GoogleProfile> {
  const client = createClient();

  const { tokens } = await client.getToken({
    code,
    codeVerifier,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
  });

  if (!tokens.id_token) {
    throw new HttpError(401, "Google did not return an identity token.");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new HttpError(401, "Google profile was incomplete.");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email.split("@")[0],
    picture: payload.picture,
    emailVerified: payload.email_verified === true,
  };
}

export async function findOrCreateGoogleUser(
  profile: GoogleProfile,
): Promise<UserDocument> {
  const byGoogleId = await User.findOne({ googleId: profile.googleId });
  if (byGoogleId) return byGoogleId;

  if (!profile.emailVerified) {
    throw new HttpError(401, "Your Google email address is not verified.");
  }

  // Only link to an existing account when Google vouches for the email.
  const byEmail = await User.findOne({ email: profile.email });
  if (byEmail) {
    byEmail.googleId = profile.googleId;
    if (!byEmail.avatarUrl && profile.picture) {
      byEmail.avatarUrl = profile.picture;
    }
    await byEmail.save();
    return byEmail;
  }

  return User.create({
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture,
    provider: "google",
    googleId: profile.googleId,
  });
}
