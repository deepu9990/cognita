import bcrypt from "bcrypt";
import { User, toPublicUser, type PublicUser } from "../models/user.model.js";
import { HttpError } from "../utils/httpError.js";

const BCRYPT_ROUNDS = 12;

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function signup(input: SignupInput): Promise<PublicUser> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new HttpError(409, "An account with that email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    provider: "local",
  });

  return toPublicUser(user);
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const user = await User.findOne({ email: input.email }).select(
    "+passwordHash",
  );

  // Hash a dummy value when no user exists so timing does not reveal accounts.
  const hash = user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(input.password, hash);

  if (!user || !user.passwordHash || !matches) {
    throw new HttpError(401, "Invalid email or password.");
  }

  return toPublicUser(user);
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(401, "Session is no longer valid.");
  }
  return toPublicUser(user);
}
