import { storage } from './storage';
import { openai } from './ai-service';
import { OBSERVATION_CATEGORIES } from '@shared/schema';

const VALID_CATEGORIES = Object.values(OBSERVATION_CATEGORIES) as string[];

interface GeneratedObservation {
  observation: string;
  category: string;
  evidenceSummary: string;
  confidence: number;
}

/**
 * Generate AI profile observations for a user based on their recent memories,
 * goals, frequent places, and existing confirmed/denied observations.
 * Max 3 new pending observations per run.
 */
export async function generateObservations(userId: string): Promise<number> {
  try {
    // Expire stale pending observations before counting — ensures the pending cap
    // is not blocked by observations the user never saw.
    await storage.expireOldPendingObservations(userId);

    // Gather data — memories capped at last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [allRecentMemories, goals, frequentPlaces, existingObs] = await Promise.all([
      storage.getLogEntries(userId, 200, 0),
      storage.getGoals(userId),
      storage.getFrequentPlaces(userId),
      storage.getProfileObservations(userId),
    ]);

    // Filter to last 30 days
    const recentMemories = allRecentMemories.filter(
      m => m.createdAt && new Date(m.createdAt) >= thirtyDaysAgo
    );

    if (recentMemories.length < 5) return 0;

    // Count pending after expiry
    const pendingCount = existingObs.filter(o => o.status === 'pending').length;
    if (pendingCount >= 6) return 0;
    const maxNew = Math.min(3, 6 - pendingCount);

    // Build context
    const memorySample = recentMemories
      .slice(0, 50)
      .map(m => `[${m.topicTag}] ${m.content.slice(0, 150)}`)
      .join('\n');

    const goalsText = goals.length > 0
      ? goals.map(g => `${g.title} (${g.progressPercent ?? 0}%)`).join(', ')
      : 'none';

    const placesText = frequentPlaces.length > 0
      ? frequentPlaces.slice(0, 10).map(p => `${p.label} (${p.visitCount} visits)`).join(', ')
      : 'none';

    const confirmedText = existingObs.filter(o => o.status === 'confirmed').map(o => o.observation).join('\n');
    const deniedText = existingObs.filter(o => o.status === 'denied').map(o => o.observation).join('\n');
    const pendingText = existingObs.filter(o => o.status === 'pending').map(o => o.observation).join('\n');

    const systemPrompt = `You are a behavioral analyst generating concise, specific observations about a user based on their memory log entries from the last 30 days.

Rules:
- Each observation must be a single, concrete statement grounded in the provided data.
- Do NOT repeat or rephrase anything in the "Already confirmed" or "Already pending" lists.
- Do NOT generate observations similar to items in the "User dismissed" list.
- Categories (use exactly one): habits, relationships, patterns, interests, goals, communication
- Confidence: 0.6–1.0 based on strength of evidence
- Evidence summary: 1-2 sentences citing specific data that supports this observation.

Output a JSON object with key "observations" containing an array of exactly ${maxNew} items (or fewer if evidence is insufficient). Format:
{"observations": [{"observation": "string", "category": "string", "evidenceSummary": "string", "confidence": number}]}`;

    const userPrompt = `Recent memories (last 30 days, ${recentMemories.length} entries):
${memorySample}

Active goals: ${goalsText}
Frequent places: ${placesText}

Already confirmed (do not repeat):
${confirmedText || 'none'}

User dismissed (do not suggest again):
${deniedText || 'none'}

Already pending (do not duplicate):
${pendingText || 'none'}

Generate up to ${maxNew} new observations.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.3,
    });

    const raw = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw);

    let rawObservations: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawObservations = parsed;
    } else if (Array.isArray(parsed.observations)) {
      rawObservations = parsed.observations;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    let created = 0;
    for (const item of rawObservations.slice(0, maxNew)) {
      if (!item || typeof item !== 'object') continue;
      const obs = item as Record<string, unknown>;
      if (!obs.observation || typeof obs.observation !== 'string') continue;

      // Validate category without `as any`
      const rawCategory = typeof obs.category === 'string' ? obs.category : '';
      const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'patterns';

      const confidence = typeof obs.confidence === 'number'
        ? Math.max(0.5, Math.min(1.0, obs.confidence))
        : 0.7;

      const evidenceSummary = typeof obs.evidenceSummary === 'string'
        ? obs.evidenceSummary.trim()
        : null;

      await storage.createProfileObservation({
        userId,
        observation: obs.observation.trim(),
        category,
        evidenceSummary,
        status: 'pending',
        confidence,
        expiresAt,
      });
      created++;
    }

    if (created > 0) {
      console.log(`[profile-obs] Generated ${created} observation(s) for user ${userId.slice(0, 8)}`);
    }

    return created;
  } catch (err) {
    console.error('[profile-obs] Error generating observations:', err);
    return 0;
  }
}
