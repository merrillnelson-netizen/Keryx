/**
 * Shared memory ingestion side-effects service.
 *
 * Both POST /api/memories and POST /api/chat/messages/:id/save (Log That)
 * must produce identical side effects after a log entry is created.
 * This module centralises those effects so they cannot drift.
 *
 * Call runMemorySideEffects() immediately after createLogEntry() in any
 * code path that logs a new memory.  All work is non-fatal — failures
 * are logged but never surface as errors to the caller.
 */

import { type User, type LogEntry } from "@shared/schema";
import { type ExtractedMetadata } from "./ai-service";
import { storage } from "./storage";

interface SideEffectOptions {
  timezone?: string;
  userProfile?: string;
  entryId: string;
}

export async function runMemorySideEffects(
  user: User,
  entry: LogEntry,
  memoryText: string,
  extracted: ExtractedMetadata,
  options: SideEffectOptions
): Promise<void> {
  const { timezone, userProfile, entryId } = options;

  // Run all side effects as fire-and-forget so callers aren't blocked
  setImmediate(() => {
    try {
      // 1. Increment monthly memory count for free-tier quota tracking
      if (user.subscriptionTier === "free") {
        const currentCount = user.memoriesThisMonth || 0;
        storage
          .updateUser(user.id, { memoriesThisMonth: currentCount + 1 })
          .catch((err) => console.error("Failed to increment memory count:", err));
      }

      // 2. Track people mentions in the people table
      if (extracted.detectedPeople && extracted.detectedPeople.length > 0) {
        Promise.all(
          extracted.detectedPeople.map((name) => storage.upsertPerson(user.id, name))
        ).catch((err) => console.error("Failed to track people:", err));
      }

      // 3. AI action detection
      import("./ai-actions-service")
        .then(({ processUserInputForActions }) => {
          processUserInputForActions(user.id, memoryText, "memory", entryId, {
            timezone,
            userProfile,
          }).catch((err) => console.warn("AI action detection failed:", err));
        })
        .catch((err) => console.warn("Failed to load ai-actions-service:", err));

      // 4. Auto-create reminder if the AI detected a reminder intent
      if (extracted.reminderIntent?.detected && extracted.reminderIntent.content) {
        const { insertReminderSchema } = require("@shared/schema");
        const reminderData: Record<string, unknown> = {
          content: extracted.reminderIntent.content,
          triggerType: extracted.reminderIntent.triggerType || "time",
          sourceMemoryId: entryId,
        };

        if (
          extracted.reminderIntent.triggerType === "time" &&
          extracted.reminderIntent.triggerTime
        ) {
          let triggerTimeStr = extracted.reminderIntent.triggerTime;
          if (!triggerTimeStr.endsWith("Z") && !triggerTimeStr.match(/[+-]\d{2}:\d{2}$/)) {
            triggerTimeStr += "Z";
          }
          const parsedTime = new Date(triggerTimeStr);
          reminderData.triggerTime =
            !isNaN(parsedTime.getTime()) && parsedTime > new Date()
              ? parsedTime
              : (() => {
                  const fallback = new Date();
                  fallback.setMinutes(fallback.getMinutes() + 30);
                  return fallback;
                })();
        }

        if (
          extracted.reminderIntent.triggerType === "location" &&
          extracted.reminderIntent.triggerLocationName
        ) {
          reminderData.triggerLocationName = extracted.reminderIntent.triggerLocationName;
        }

        storage
          .createReminder(user.id, reminderData as Parameters<typeof storage.createReminder>[1])
          .catch((err) => console.error("Failed to auto-create reminder:", err));
      }

      // 5. Fire automation engine triggers
      import("./automation-engine")
        .then(({ fireTrigger, AUTOMATION_TRIGGERS }) => {
          const moodScore = extracted.moodScore ?? undefined;
          const POSITIVE_MOODS = new Set([
            "happy", "excited", "hopeful", "grateful", "peaceful",
            "proud", "motivated", "nostalgic",
          ]);
          const NEGATIVE_MOODS = new Set([
            "sad", "anxious", "frustrated", "stressed", "angry", "confused",
          ]);
          const moodLabel = (extracted.mood || "neutral").toLowerCase();
          const aiSentiment: "positive" | "neutral" | "negative" = POSITIVE_MOODS.has(moodLabel)
            ? "positive"
            : NEGATIVE_MOODS.has(moodLabel)
            ? "negative"
            : moodScore !== undefined
            ? moodScore > 20
              ? "positive"
              : moodScore < -20
              ? "negative"
              : "neutral"
            : "neutral";

          const aiTopics = extracted.topicTag ? [extracted.topicTag] : [];
          const aiPeople = extracted.detectedPeople || [];
          const ctx = {
            userId: user.id,
            memoryContent: memoryText,
            moodScore,
            topics: aiTopics,
            peopleNames: aiPeople,
            aiTopics,
            aiPeople,
            aiMoodLabel: extracted.mood || undefined,
            aiSentiment,
          };

          fireTrigger(user.id, AUTOMATION_TRIGGERS.MEMORY_LOGGED, ctx).catch(() => {});

          if (moodScore !== undefined) {
            if (moodScore <= 3) {
              fireTrigger(user.id, AUTOMATION_TRIGGERS.MOOD_DROPPED, ctx).catch(() => {});
            } else if (moodScore >= 8) {
              fireTrigger(user.id, AUTOMATION_TRIGGERS.MOOD_SPIKED, ctx).catch(() => {});
            }
          }

          for (const personName of aiPeople) {
            fireTrigger(user.id, AUTOMATION_TRIGGERS.PERSON_MENTIONED, {
              ...ctx,
              personName,
            }).catch(() => {});
          }

          fireTrigger(user.id, AUTOMATION_TRIGGERS.KEYWORD_DETECTED, {
            ...ctx,
            keyword: memoryText,
          }).catch(() => {});
        })
        .catch(() => {});
    } catch (bgError) {
      console.error("Memory side-effects error (non-fatal):", bgError);
    }
  });
}
