/**
 * Relay Outbound Service
 *
 * Pushes structured event payloads FROM Keryx TO user-configured external surfaces
 * (Android Bridge, Meta Glasses, custom webhooks, etc.).
 *
 * Key behaviors:
 * - Only dispatches to destinations with `outboundEnabled = true`.
 * - Serializes payload as JSON (default) or plain text based on `outboundFormat`.
 * - POSTs with `X-API-Key` header if the destination has an apiKey configured.
 * - 2-attempt retry on transient failure (network error or 5xx), with a 1-second delay.
 * - Logs every dispatch attempt to `relay_events` with `direction = 'outbound'`.
 */

import { storage } from "./storage";
import type { RelayDestination } from "@shared/schema";

export type OutboundEventType =
  | "high_signal"
  | "auto_action"
  | "briefing"
  | "financial_alert"
  | "test_ping";

export interface DispatchResult {
  destinationLabel: string;
  ok: boolean;
  status?: number;
  error?: string;
  attempt: number;
}

const DISPATCH_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;

/** Sleep helper for retry delay */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialize a payload for a given destination format.
 * 'json' → JSON string (the standard path).
 * 'text' → extract the most relevant human-readable string from the payload.
 */
function serializePayload(
  eventType: OutboundEventType,
  payload: Record<string, unknown>,
  format: string
): string {
  if (format === "text") {
    // Produce a compact human-readable string
    const parts: string[] = [`[Keryx/${eventType}]`];
    if (typeof payload.summary === "string") parts.push(payload.summary);
    else if (typeof payload.title === "string") parts.push(payload.title);
    else if (typeof payload.content === "string") parts.push(payload.content);
    else if (typeof payload.message === "string") parts.push(payload.message);
    return parts.join(" ");
  }
  // Default: JSON
  return JSON.stringify({
    keryx_event: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

/**
 * Attempt a single POST to a destination URL.
 * Returns true if the HTTP response is 2xx.
 */
async function postToDestination(
  dest: RelayDestination,
  body: string,
  isJson: boolean
): Promise<{ ok: boolean; status: number; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": isJson ? "application/json" : "text/plain",
    "User-Agent": "Keryx-Relay/1.0",
  };
  if (dest.apiKey) headers["X-API-Key"] = dest.apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  try {
    const resp = await fetch(dest.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Dispatch an outbound event to all enabled outbound destinations.
 *
 * @param userId      — Keryx user ID
 * @param eventType   — semantic event type (high_signal, briefing, auto_action, …)
 * @param payload     — event data to send
 * @param options     — optional filters (briefingOnly: only dispatch to briefingRelay destinations)
 *
 * @returns Array of per-destination dispatch results (always non-throwing).
 */
export async function dispatchOutbound(
  userId: string,
  eventType: OutboundEventType,
  payload: Record<string, unknown>,
  options?: { briefingOnly?: boolean }
): Promise<DispatchResult[]> {
  let destinations: RelayDestination[];
  try {
    const all = await storage.getRelayDestinations(userId);
    destinations = all.filter((d) => d.enabled && d.outboundEnabled);
    if (options?.briefingOnly) {
      destinations = destinations.filter((d) => d.outboundBriefingRelay);
    }
  } catch (err) {
    console.error("[relay-outbound] Failed to load destinations:", err instanceof Error ? err.message : err);
    return [];
  }

  if (destinations.length === 0) return [];

  const results: DispatchResult[] = [];

  await Promise.allSettled(
    destinations.map(async (dest) => {
      const isJson = (dest.outboundFormat ?? "json") !== "text";
      const body = serializePayload(eventType, payload, dest.outboundFormat ?? "json");
      let lastResult: { ok: boolean; status: number; error?: string } = {
        ok: false,
        status: 0,
        error: "Not attempted",
      };
      let attempt = 0;

      for (attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        lastResult = await postToDestination(dest, body, isJson);
        if (lastResult.ok) break;
        // Retry on network error or 5xx server error — not on 4xx
        const isTransient = lastResult.status === 0 || lastResult.status >= 500;
        if (!isTransient || attempt >= MAX_RETRIES) break;
        await sleep(1000);
      }

      results.push({
        destinationLabel: dest.label,
        ok: lastResult.ok,
        status: lastResult.status,
        error: lastResult.error,
        attempt,
      });

      // Log to relay_events regardless of outcome
      setImmediate(async () => {
        try {
          await storage.createRelayEvent({
            userId,
            direction: "outbound",
            type: eventType,
            source: "keryx_agent",
            payload: {
              eventType,
              destinationLabel: dest.label,
              destinationUrl: dest.url,
              ok: lastResult.ok,
              status: lastResult.status,
              attempt,
              error: lastResult.error,
              payloadPreview: body.slice(0, 500),
              ...payload,
            } as Record<string, unknown>,
            routedTo: [dest.label],
          });
        } catch (logErr) {
          console.warn("[relay-outbound] Failed to log event:", logErr instanceof Error ? logErr.message : logErr);
        }
      });
    })
  );

  const succeeded = results.filter((r) => r.ok).length;
  if (results.length > 0) {
    console.log(
      `[relay-outbound] ${eventType} dispatched: ${succeeded}/${results.length} succeeded`
    );
  }

  return results;
}

/**
 * Convenience: dispatch a high-signal VIP alert to outbound destinations.
 */
export async function dispatchHighSignalAlert(
  userId: string,
  personName: string,
  discoveryTitle: string,
  discoveryUrl?: string,
  matchContext?: string
): Promise<DispatchResult[]> {
  return dispatchOutbound(userId, "high_signal", {
    title: `VIP Alert: ${personName}`,
    summary: `${personName} may be mentioned in: "${discoveryTitle}"`,
    person: personName,
    discoveryTitle,
    discoveryUrl,
    matchContext,
  });
}

/**
 * Convenience: dispatch an auto-executed action result.
 */
export async function dispatchAutoActionResult(
  userId: string,
  actionType: string,
  actionTitle: string,
  resultSummary: string
): Promise<DispatchResult[]> {
  return dispatchOutbound(userId, "auto_action", {
    title: `Action Completed: ${actionTitle}`,
    summary: resultSummary,
    actionType,
    actionTitle,
  });
}

/**
 * Convenience: dispatch a briefing summary to outbound destinations.
 * Only dispatches to destinations with outboundBriefingRelay = true.
 */
export async function dispatchBriefingSummary(
  userId: string,
  briefingSummary: string,
  focusAreas?: string[]
): Promise<DispatchResult[]> {
  return dispatchOutbound(
    userId,
    "briefing",
    {
      title: "Daily Briefing",
      summary: briefingSummary,
      focusAreas,
    },
    { briefingOnly: true }
  );
}

/**
 * Convenience: dispatch a financial alert.
 */
export async function dispatchFinancialAlert(
  userId: string,
  alertTitle: string,
  alertDetails: string
): Promise<DispatchResult[]> {
  return dispatchOutbound(userId, "financial_alert", {
    title: alertTitle,
    summary: alertDetails,
  });
}
