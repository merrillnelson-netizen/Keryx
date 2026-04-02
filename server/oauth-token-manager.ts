/**
 * OAuth Token Manager
 * Self-contained OAuth 2.0 token storage, refresh, and secure state for Google and Microsoft.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 */

import { db } from "./db";
import { oauthTokens, oauthNonces } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
import crypto from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// In-memory token cache (access token + email)
interface CachedToken {
  accessToken: string;
  expiresAt: Date | null;
  accountEmail: string | null;
  fetchedAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const CACHE_TTL_MS = 30 * 1000;      // 30 seconds
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const NONCE_TTL_MS = 10 * 60 * 1000;   // nonces expire after 10 minutes

function cacheKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

// ============================================================
// Secure OAuth state (nonce-based CSRF protection)
// ============================================================

/**
 * Generate a cryptographically random nonce, store it in the DB with a TTL,
 * and return the nonce string to embed in the OAuth `state` param.
 */
export async function generateOauthState(
  userId: string,
  provider: "google" | "microsoft"
): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  // Clean up expired nonces first (best-effort)
  await db.delete(oauthNonces).where(lt(oauthNonces.expiresAt, new Date())).catch(() => {});

  await db.insert(oauthNonces).values({ nonce, userId, provider, expiresAt });
  return nonce;
}

/**
 * Validate an OAuth callback state string. Returns the userId if valid,
 * throws an error if invalid, expired, or tampered.
 */
export async function validateOauthState(
  nonce: string,
  provider: "google" | "microsoft"
): Promise<string> {
  if (!nonce || nonce.length !== 64 || !/^[0-9a-f]+$/.test(nonce)) {
    throw new Error("Invalid OAuth state format");
  }

  const [row] = await db
    .select()
    .from(oauthNonces)
    .where(and(eq(oauthNonces.nonce, nonce), eq(oauthNonces.provider, provider)))
    .limit(1);

  if (!row) {
    throw new Error("OAuth state not found or already used");
  }

  if (row.expiresAt < new Date()) {
    await db.delete(oauthNonces).where(eq(oauthNonces.nonce, nonce)).catch(() => {});
    throw new Error("OAuth state expired");
  }

  // One-time use: delete after successful validation
  await db.delete(oauthNonces).where(eq(oauthNonces.nonce, nonce));

  return row.userId;
}

// ============================================================
// Token storage and retrieval
// ============================================================

/**
 * Get a valid access token for the given user and provider.
 * Throws if no token is stored or if refresh fails.
 */
export async function getAccessToken(
  userId: string,
  provider: "google" | "microsoft"
): Promise<string> {
  const key = cacheKey(userId, provider);
  const cached = tokenCache.get(key);
  const now = Date.now();

  // Return cached token if still fresh and not near expiry
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    if (!cached.expiresAt || cached.expiresAt.getTime() > now + EXPIRY_BUFFER_MS) {
      return cached.accessToken;
    }
  }

  // Load from DB
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)))
    .limit(1);

  if (!row) {
    throw new Error(`No ${provider} token found for user ${userId}. Please reconnect.`);
  }

  // Check if token needs refresh
  const needsRefresh =
    row.expiresAt && row.expiresAt.getTime() <= now + EXPIRY_BUFFER_MS;

  if (needsRefresh) {
    if (!row.refreshToken) {
      // Token expired, no refresh token — user must re-authenticate
      await deleteTokens(userId, provider);
      throw new Error(`${provider} token expired and no refresh token available. Please reconnect.`);
    }
    const refreshed = await refreshToken(userId, provider, row.refreshToken);
    return refreshed; // throws on failure
  }

  // Cache and return existing token
  tokenCache.set(key, {
    accessToken: row.accessToken,
    expiresAt: row.expiresAt,
    accountEmail: row.accountEmail,
    fetchedAt: now,
  });

  return row.accessToken;
}

/**
 * Convenience getter for Google — throws if not connected.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  return getAccessToken(userId, "google");
}

/**
 * Convenience getter for Microsoft — throws if not connected.
 */
export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  return getAccessToken(userId, "microsoft");
}

/**
 * Store or update OAuth tokens for a user/provider.
 */
export async function storeTokens(
  userId: string,
  provider: "google" | "microsoft",
  data: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scopes?: string | null;
    tokenType?: string;
    accountEmail?: string | null;
  }
): Promise<void> {
  const key = cacheKey(userId, provider);

  await db
    .insert(oauthTokens)
    .values({
      userId,
      provider,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null,
      scopes: data.scopes ?? null,
      tokenType: data.tokenType ?? "Bearer",
      accountEmail: data.accountEmail ?? null,
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        accessToken: data.accessToken,
        ...(data.refreshToken !== undefined && { refreshToken: data.refreshToken }),
        expiresAt: data.expiresAt ?? null,
        scopes: data.scopes ?? null,
        tokenType: data.tokenType ?? "Bearer",
        ...(data.accountEmail !== undefined && { accountEmail: data.accountEmail }),
        updatedAt: new Date(),
      },
    });

  tokenCache.set(key, {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt ?? null,
    accountEmail: data.accountEmail ?? null,
    fetchedAt: Date.now(),
  });
}

/**
 * Delete stored tokens (disconnect).
 */
export async function deleteTokens(
  userId: string,
  provider: "google" | "microsoft"
): Promise<void> {
  await db
    .delete(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)));
  tokenCache.delete(cacheKey(userId, provider));
}

/**
 * Check if a user has a valid (non-expired) token stored for the given provider.
 * Returns false rather than throwing.
 */
export async function hasValidToken(
  userId: string,
  provider: "google" | "microsoft"
): Promise<boolean> {
  try {
    await getAccessToken(userId, provider);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the stored account email for a provider (if available).
 */
export async function getAccountEmail(
  userId: string,
  provider: "google" | "microsoft"
): Promise<string | null> {
  const key = cacheKey(userId, provider);
  const cached = tokenCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.accountEmail;
  }

  const [row] = await db
    .select({ accountEmail: oauthTokens.accountEmail })
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)))
    .limit(1);

  return row?.accountEmail ?? null;
}

// ============================================================
// Token refresh
// ============================================================

async function refreshToken(
  userId: string,
  provider: "google" | "microsoft",
  refreshTokenValue: string
): Promise<string> {
  const clientId =
    provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
  const clientSecret =
    provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(`Cannot refresh ${provider} token: OAuth credentials not configured`);
  }

  const tokenUrl = provider === "google" ? GOOGLE_TOKEN_URL : MICROSOFT_TOKEN_URL;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[OAuth] Failed to refresh ${provider} token:`, err);
    // Invalid/revoked refresh token — disconnect
    if (response.status === 400 || response.status === 401) {
      await deleteTokens(userId, provider);
      throw new Error(`${provider} refresh token is invalid or revoked. Please reconnect.`);
    }
    throw new Error(`Failed to refresh ${provider} token: ${response.status}`);
  }

  const json = await response.json();
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;

  await storeTokens(userId, provider, {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshTokenValue, // Google may not return a new one
    expiresAt,
    scopes: json.scope,
    tokenType: json.token_type ?? "Bearer",
  });

  console.log(`[OAuth] Refreshed ${provider} token for user ${userId}`);
  return json.access_token;
}

// ============================================================
// OAuth authorization URL builders
// ============================================================

export function getGoogleAuthUrl(nonce: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getMicrosoftAuthUrl(nonce: string): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("MICROSOFT_CLIENT_ID or MICROSOFT_REDIRECT_URI not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "offline_access",
      "Calendars.ReadWrite",
      "Mail.ReadWrite",
      "Mail.Send",
      "User.Read",
    ].join(" "),
    response_mode: "query",
    state: nonce,
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

// ============================================================
// Code exchange helpers
// ============================================================

export async function exchangeGoogleCode(userId: string, code: string): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth credentials not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google code exchange failed: ${err}`);
  }

  const json = await response.json();
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;

  // Fetch the user's email from Google's userinfo endpoint
  let accountEmail: string | null = null;
  try {
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      accountEmail = userInfo.email ?? null;
    }
  } catch {
    // Email fetch is best-effort
  }

  await storeTokens(userId, "google", {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scopes: json.scope,
    tokenType: json.token_type ?? "Bearer",
    accountEmail,
  });

  console.log(`[OAuth] Google tokens stored for user ${userId} (${accountEmail ?? "email unknown"})`);
}

export async function exchangeMicrosoftCode(userId: string, code: string): Promise<void> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft OAuth credentials not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    scope: ["offline_access", "Calendars.ReadWrite", "Mail.ReadWrite", "Mail.Send", "User.Read"].join(" "),
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Microsoft code exchange failed: ${err}`);
  }

  const json = await response.json();
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;

  // Fetch the user's email from Microsoft Graph
  let accountEmail: string | null = null;
  try {
    const userInfoRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      accountEmail = userInfo.mail ?? userInfo.userPrincipalName ?? null;
    }
  } catch {
    // Email fetch is best-effort
  }

  await storeTokens(userId, "microsoft", {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scopes: json.scope,
    tokenType: json.token_type ?? "Bearer",
    accountEmail,
  });

  console.log(`[OAuth] Microsoft tokens stored for user ${userId} (${accountEmail ?? "email unknown"})`);
}
