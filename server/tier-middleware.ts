import { type Request, type Response, type NextFunction } from "express";
import { type User } from "@shared/schema";
import { storage } from "./storage";

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, life_os: 2 };

function isBillingEnforcementActive(): boolean {
  return process.env.BILLING_ENFORCEMENT === 'true';
}

function isSubscriptionActive(user: User): boolean {
  if (user.subscriptionStatus !== 'active' && user.subscriptionStatus !== 'trialing') {
    return false;
  }
  if (user.currentPeriodEnd === null || user.currentPeriodEnd === undefined) {
    return true;
  }
  return new Date(user.currentPeriodEnd) > new Date();
}

export function requireTier(minTier: 'pro' | 'life_os') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isBillingEnforcementActive()) {
      return next();
    }
    const user = req.user as User | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRank = TIER_RANK[user.subscriptionTier] ?? 0;
    const requiredRank = TIER_RANK[minTier];
    if (userRank >= requiredRank && isSubscriptionActive(user)) {
      return next();
    }
    return res.status(403).json({
      error: 'Subscription required',
      upgradeRequired: true,
      requiredTier: minTier,
      currentTier: user.subscriptionTier,
    });
  };
}

export function requireMemoryQuota() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isBillingEnforcementActive()) {
      return next();
    }
    const user = req.user as User | undefined;
    if (!user || user.subscriptionTier !== 'free') {
      return next();
    }

    const now = new Date();
    const monthStart = now.getMonth();
    const yearStart = now.getFullYear();

    let needsReset = false;
    if (!user.memoriesMonthStart) {
      needsReset = true;
    } else {
      const ms = new Date(user.memoriesMonthStart);
      if (ms.getMonth() !== monthStart || ms.getFullYear() !== yearStart) {
        needsReset = true;
      }
    }

    if (needsReset) {
      try {
        await storage.updateUser(user.id, {
          memoriesThisMonth: 0,
          memoriesMonthStart: new Date(yearStart, monthStart, 1),
        });
        (req.user as any).memoriesThisMonth = 0;
      } catch {
        // Non-fatal: continue without resetting
      }
      return next();
    }

    const limit = 100;
    if (user.memoriesThisMonth >= limit) {
      return res.status(403).json({
        error: 'Monthly memory limit reached',
        upgradeRequired: true,
        requiredTier: 'pro',
        memoriesUsed: user.memoriesThisMonth,
        memoriesLimit: limit,
      });
    }

    return next();
  };
}
