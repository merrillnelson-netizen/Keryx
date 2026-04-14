import { storage } from './storage';
import { openai } from './ai-service';
import { OBSERVATION_CATEGORIES } from '@shared/schema';

interface GeneratedObservation {
  observation: string;
  category: string;
  evidenceSummary: string;
  confidence: number;
}

/**
 * Generate AI profile observations for a user based on their recent memories,
 * goals, and existing confirmed/denied observations.
 * Max 3 new pending observations per run.
 */
export async function generateObservations(userId: string): Promise<number> {
  try {
    // Gather data
    const [recentMemories, goals, existingObs] = await Promise.all([
      storage.getLogEntries(userId, { limit: 60 }),
      storage.getGoals(userId),
      storage.getProfileObservations(userId),
    ]);

    if (recentMemories.length < 5) return 0;

    // Build context
    const memorySample = recentMemories
      .slice(0, 40)
      .map(m => `[${m.topicTag}] ${m.content.slice(0, 150)}`)
      .join('\n');

    const goalsText = goals.length > 0
      ? goals.map(g => `${g.title} (${g.progressPercent ?? 0}%)`).join(', ')
      : 'none';

    // Avoid duplicating existing observations
    const confirmedText = existingObs
      .filter(o => o.status === 'confirmed')
      .map(o => o.observation)
      .join('\n');
    const deniedText = existingObs
      .filter(o => o.status === 'denied')
      .map(o => o.observation)
      .join('\n');
    const pendingText = existingObs
      .filter(o => o.status === 'pending')
      .map(o => o.observation)
      .join('\n');

    // Count pending — don't generate if already 6+ pending (avoid spam)
    const pendingCount = existingObs.filter(o => o.status === 'pending').length;
    if (pendingCount >= 6) return 0;

    const maxNew = Math.min(3, 6 - pendingCount);

    const systemPrompt = `You are a behavioral analyst generating concise, specific observations about a user based on their memory log entries.

Rules:
- Each observation must be a single, concrete, actionable statement (not generic advice).
- Observations must be grounded in specific patterns from the data provided.
- Do NOT repeat or rephrase anything in the "Already confirmed" or "Already pending" lists.
- Do NOT generate observations similar to items in the "User dismissed" list.
- Categories: habits, relationships, patterns, interests, goals, communication
- Confidence: 0.6–1.0 based on strength of evidence
- Evidence summary: 1-2 sentences explaining which data supports this observation.

Output JSON array of exactly ${maxNew} observations (or fewer if you cannot find enough evidence). Format:
[{"observation": "string", "category": "string", "evidenceSummary": "string", "confidence": number}]`;

    const userPrompt = `Recent memories (last 60):
${memorySample}

Active goals: ${goalsText}

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

    let observations: GeneratedObservation[] = [];
    const raw = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw);
    // Accept both {observations:[]} and []
    if (Array.isArray(parsed)) {
      observations = parsed;
    } else if (Array.isArray(parsed.observations)) {
      observations = parsed.observations;
    }

    // Validate categories
    const validCategories = Object.values(OBSERVATION_CATEGORIES);

    let created = 0;
    for (const obs of observations.slice(0, maxNew)) {
      if (!obs.observation || typeof obs.observation !== 'string') continue;
      const category = validCategories.includes(obs.category as any) ? obs.category : 'patterns';
      const confidence = typeof obs.confidence === 'number'
        ? Math.max(0.5, Math.min(1.0, obs.confidence))
        : 0.7;

      // 14-day expiry for pending observations
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      await storage.createProfileObservation({
        userId,
        observation: obs.observation.trim(),
        category,
        evidenceSummary: obs.evidenceSummary?.trim() || null,
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
