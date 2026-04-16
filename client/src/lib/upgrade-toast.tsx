import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export interface UpgradeRequiredPayload {
  upgradeRequired?: boolean;
  requiredTier?: "pro" | "life_os";
  currentTier?: string;
  error?: string;
  memoriesUsed?: number;
  memoriesLimit?: number;
}

export class UpgradeRequiredError extends Error {
  upgradeRequired = true;
  requiredTier?: "pro" | "life_os";
  payload: UpgradeRequiredPayload;

  constructor(payload: UpgradeRequiredPayload, message?: string) {
    super(message ?? payload.error ?? "Upgrade required");
    this.name = "UpgradeRequiredError";
    this.requiredTier = payload.requiredTier;
    this.payload = payload;
  }
}

let lastUpgradeToastAt = 0;

function tierLabel(tier?: string) {
  if (tier === "life_os") return "Life OS";
  return "Pro";
}

export function showUpgradeToast(payload: UpgradeRequiredPayload) {
  const now = Date.now();
  if (now - lastUpgradeToastAt < 1500) return;
  lastUpgradeToastAt = now;

  const label = tierLabel(payload.requiredTier);
  const isQuota = typeof payload.memoriesLimit === "number";

  const title = isQuota
    ? "Monthly memory limit reached"
    : `${label} feature`;

  const description = isQuota
    ? `You've used ${payload.memoriesUsed ?? payload.memoriesLimit} of ${payload.memoriesLimit} memories this month. Upgrade to Keryx ${label} to keep going.`
    : `Upgrade to Keryx ${label} to unlock this.`;

  // Fire on next tick so it replaces any generic error toast shown
  // synchronously by a mutation's onError handler (TOAST_LIMIT = 1).
  setTimeout(() => {
    toast({
      title,
      description,
      action: (
        <ToastAction
          altText="Upgrade"
          onClick={() => {
            window.location.assign("/billing");
          }}
        >
          Upgrade
        </ToastAction>
      ),
    });
  }, 0);
}

/**
 * Inspect a non-OK response. If it's a 403 with `upgradeRequired: true`,
 * trigger the shared upgrade toast and return the parsed payload. Otherwise
 * return null. Safe to call with an already-consumed body (uses res.clone()).
 */
export async function tryHandleUpgradeRequired(
  res: Response,
): Promise<UpgradeRequiredPayload | null> {
  if (res.status !== 403) return null;
  try {
    const data = await res.clone().json();
    if (data && typeof data === "object" && data.upgradeRequired) {
      const payload = data as UpgradeRequiredPayload;
      showUpgradeToast(payload);
      return payload;
    }
  } catch {
    // Body wasn't JSON or couldn't be parsed - ignore.
  }
  return null;
}
