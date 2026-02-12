import OpenAI from "openai";
import { storage } from "./storage";
import { generateEmbedding } from "./ai-service";
import type { Message, InsertMessage } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface MessageAnalysis {
  topicTag: string;
  detectedPeople: string[];
  mood: string;
  moodScore: number;
  importance: number;
}

export async function processMessageBatch(
  userId: string,
  unprocessedMessages: Message[]
): Promise<number> {
  let processed = 0;
  const batchSize = 10;

  for (let i = 0; i < unprocessedMessages.length; i += batchSize) {
    const batch = unprocessedMessages.slice(i, i + batchSize);
    const conversationGroups = new Map<string, Message[]>();

    for (const msg of batch) {
      const existing = conversationGroups.get(msg.conversationId) || [];
      existing.push(msg);
      conversationGroups.set(msg.conversationId, existing);
    }

    const groupEntries = Array.from(conversationGroups.entries());
    for (const [convId, msgs] of groupEntries) {
      try {
        const conversation = await storage.getMessageConversation(convId, userId);
        const contactName = conversation?.contactName || conversation?.contactAddress || 'Unknown';

        const contextWindow = msgs
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map(m => {
            const dir = m.direction === 'sent' ? 'Me' : contactName;
            return `[${new Date(m.timestamp).toISOString().split('T')[0]}] ${dir}: ${m.body || ''}`;
          })
          .join('\n');

        const analysis = await analyzeMessageGroup(contextWindow, contactName);

        const messageIds: string[] = [];
        const updates: Partial<InsertMessage>[] = [];

        for (let j = 0; j < msgs.length; j++) {
          const msg = msgs[j];
          messageIds.push(msg.id);

          let embedding: number[] | undefined;
          if (msg.body && msg.body.length > 10) {
            try {
              embedding = await generateEmbedding(msg.body);
            } catch {
              // skip embedding on failure
            }
          }

          updates.push({
            topicTag: analysis.topicTag,
            detectedPeople: analysis.detectedPeople,
            mood: analysis.mood,
            moodScore: analysis.moodScore,
            importance: analysis.importance,
            embeddingVector: embedding,
          });
        }

        await storage.markMessagesProcessed(messageIds, updates);
        processed += msgs.length;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`Failed to process message group for conversation ${convId}:`, error);
        }
      }
    }
  }

  return processed;
}

async function analyzeMessageGroup(context: string, contactName: string): Promise<MessageAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: `You analyze text message conversations and extract metadata. Return JSON with:

1. topicTag: One of: Work, Family, Social, Health, Financial, Shopping, Travel, Learning, Home, Recreation, Food, Meeting, Personal, General
2. detectedPeople: Array of person names mentioned (not "Me" or generic references)
3. mood: One of: happy, sad, anxious, excited, neutral, frustrated, hopeful, grateful, stressed, peaceful, angry, confused, proud, nostalgic, motivated
4. moodScore: -100 to +100 sentiment score
5. importance: 1-10 significance rating considering:
   - 1-3: Casual small talk, greetings, logistics
   - 4-5: Normal daily coordination
   - 6-7: Meaningful personal exchange, plans, decisions
   - 8-10: Significant emotional content, major life events, important decisions

The conversation is with "${contactName}". Always include "${contactName}" in detectedPeople if it's a real name (not a phone number).

Return ONLY valid JSON.`
        },
        {
          role: "user",
          content: context
        }
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No AI response');

    const parsed = JSON.parse(content);
    return {
      topicTag: parsed.topicTag || 'General',
      detectedPeople: Array.isArray(parsed.detectedPeople) ? parsed.detectedPeople : [],
      mood: parsed.mood || 'neutral',
      moodScore: typeof parsed.moodScore === 'number' ? parsed.moodScore : 0,
      importance: typeof parsed.importance === 'number' ? Math.min(10, Math.max(1, parsed.importance)) : 5,
    };
  } catch {
    return {
      topicTag: 'General',
      detectedPeople: [],
      mood: 'neutral',
      moodScore: 0,
      importance: 5,
    };
  }
}
