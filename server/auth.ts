"use node";

/**
 * Neon Auth verification (managed Better Auth on the branch).
 *
 * The frontend sends `Authorization: Bearer <session JWT>`; we verify the
 * signature against Neon Auth's JWKS. Only the `sub` (user id) is trusted —
 * email/role claims are re-read from the local `users` mirror row if needed.
 *
 * All routes are public by default (the app's identity model is device-token
 * + IP based). Endpoints that opt into auth use `requireAuth`.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!AUTH_BASE_URL) {
    throw new Error("NEON_AUTH_BASE_URL is not configured — enable Neon Auth in neon.ts and redeploy.");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`));
  }
  return jwks;
}

export type AuthIdentity = { userId: string };

/** Verify a Bearer JWT issued by Neon Auth. Throws on any invalid token. */
export async function verifyNeonAuthToken(request: Request): Promise<AuthIdentity> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing bearer token");
  }
  const token = header.slice(7).trim();
  if (!AUTH_BASE_URL) {
    throw new Error("NEON_AUTH_BASE_URL is not configured");
  }
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: AUTH_BASE_URL,
    audience: AUTH_BASE_URL,
  });
  if (!payload.sub) throw new Error("Token has no subject");
  return { userId: payload.sub };
}

/** Extract identity without throwing — returns null when absent/invalid. */
export async function tryVerifyNeonAuthToken(request: Request): Promise<AuthIdentity | null> {
  try {
    return await verifyNeonAuthToken(request);
  } catch {
    return null;
  }
}
