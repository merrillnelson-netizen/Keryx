/**
 * OAuth Token Manager
 * Self-contained OAuth 2.0 token storage and refresh for Google and Microsoft.
 * Replaces Replit connector dependency entirely.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 *
 * Redirect URIs to register in each provider's developer console:
 *   Google:    https://<your-domain>/api/auth/google/callback
 *   Microsoft: https://<your-domain>/api/auth/microsoft/callback
 */

import { db } from "./db";
import { oauthTokens } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// In-memory token cache to avoid unnecessary DB hits
interface CachedToken {
  accessToken: string;
  expiresAt: Date | null;
  fetchedAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

function cacheKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

/**
 * Get a valid access token for the given user and provider.
 * Refreshes automatically if expired. Returns null if no token stored.
 */
export async function getAccessToken(
  userId: string,
  provider: "google" | "microsoft"
): Promise<string | null> {
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

  if (!row) return null;

  // Check if token needs refresh
  const needsRefresh =
    row.expiresAt && row.expiresAt.getTime() <= now + EXPIRY_BUFFER_MS;

  if (needsRefresh && row.refreshToken) {
    const refreshed = await refreshToken(userId, provider, row.refreshToken);
    if (refreshed) return refreshed;
  }

  // Cache and return existing token
  tokenCache.set(key, {
    accessToken: row.accessToken,
    expiresAt: row.expiresAt,
    fetchedAt: now,
  });

  return row.accessToken;
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
    scope?: string | null;
    tokenType?: string;
  }
): Promise<void> {
  const key = cacheKey(userId, provider);

  // Upsert using onConflictDoUpdate
  await db
    .insert(oauthTokens)
    .values({
      userId,
      provider,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null,
      scope: data.scope ?? null,
      tokenType: data.tokenType ?? "Bearer",
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        accessToken: data.accessToken,
        ...(data.refreshToken !== undefined && { refreshToken: data.refreshToken }),
        expiresAt: data.expiresAt ?? null,
        scope: data.scope ?? null,
        tokenType: data.tokenType ?? "Bearer",
        updatedAt: new Date(),
      },
    });

  // Update cache
  tokenCache.set(key, {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt ?? null,
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
 * Check if a user has a valid token stored for the given provider.
 */
export async function hasValidToken(
  userId: string,
  provider: "google" | "microsoft"
): Promise<boolean> {
  const token = await getAccessToken(userId, provider);
  return token !== null;
}

/**
 * Refresh an access token using the refresh token.
 * Stores the new token and returns the access token string, or null on failure.
 */
async function refreshToken(
  userId: string,
  provider: "google" | "microsoft",
  refreshTokenValue: string
): Promise<string | null> {
  try {
    const clientId =
      provider === "google"
        ? process.env.GOOGLE_CLIENT_ID
        : process.env.MICROSOFT_CLIENT_ID;
    const clientSecret =
      provider === "google"
        ? process.env.GOOGLE_CLIENT_SECRET
        : process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn(`[OAuth] Cannot refresh ${provider} token: missing client credentials`);
      return null;
    }

    const tokenUrl =
      provider === "google" ? GOOGLE_TOKEN_URL : MICROSOFT_TOKEN_URL;

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
      // If refresh token is invalid/revoked, remove stored tokens
      if (response.status === 400 || response.status === 401) {
        await deleteTokens(userId, provider);
      }
      return null;
    }

    const json = await response.json();
    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

    await storeTokens(userId, provider, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshTokenValue, // Google may not return a new refresh token
      expiresAt,
      scope: json.scope,
      tokenType: json.token_type ?? "Bearer",
    });

    console.log(`[OAuth] Refreshed ${provider} token for user ${userId}`);
    return json.access_token;
  } catch (error) {
    console.error(`[OAuth] Error refreshing ${provider} token:`, error);
    return null;
  }
}

/**
 * Build the Google OAuth authorization URL.
 */
export function getGoogleAuthUrl(state: string): string {
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
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange a Google authorization code for tokens.
 */
export async function exchangeGoogleCode(
  userId: string,
  code: string
): Promise<boolean> {
  try {
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
      console.error("[OAuth] Google code exchange failed:", err);
      return false;
    }

    const json = await response.json();
    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

    await storeTokens(userId, "google", {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
      scope: json.scope,
      tokenType: json.token_type ?? "Bearer",
    });

    console.log(`[OAuth] Google tokens stored for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[OAuth] Google code exchange error:", error);
    return false;
  }
}

/**
 * Build the Microsoft OAuth authorization URL.
 */
export function getMicrosoftAuthUrl(state: string): string {
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
    state,
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange a Microsoft authorization code for tokens.
 */
export async function exchangeMicrosoftCode(
  userId: string,
  code: string
): Promise<boolean> {
  try {
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
      scope: [
        "offline_access",
        "Calendars.ReadWrite",
        "Mail.ReadWrite",
        "Mail.Send",
        "User.Read",
      ].join(" "),
    });

    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[OAuth] Microsoft code exchange failed:", err);
      return false;
    }

    const json = await response.json();
    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

    await storeTokens(userId, "microsoft", {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
      scope: json.scope,
      tokenType: json.token_type ?? "Bearer",
    });

    console.log(`[OAuth] Microsoft tokens stored for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[OAuth] Microsoft code exchange error:", error);
    return false;
  }
}
