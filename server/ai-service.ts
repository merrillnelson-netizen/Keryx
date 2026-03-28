import OpenAI from "openai";

/**
 * Convert a UTC Date to a formatted date string in the user's timezone
 * Prevents the common bug where a memory at 11 PM Mountain shows as the next day in UTC
 */
export function formatDateForTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2'); // MM/DD/YYYY -> YYYY-MM-DD
}

/**
 * Convert a UTC Date to a full datetime string in the user's timezone
 */
export function formatDateTimeForTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Using gpt-4o-mini for fast, cost-effective AI processing
// Supports both Replit AI Integration and direct OpenAI API key
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const hasIntegration = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
// Log initialization only in development
if (process.env.NODE_ENV === 'development') {
  console.log(`[ai-service] OpenAI initialized - using ${hasIntegration ? 'Replit AI Integration' : 'direct API key'}, key present: ${!!apiKey}`);
}

export const openai = new OpenAI({ 
  apiKey,
  // Only set baseURL when using Replit AI Integration
  ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
  timeout: 30000,
  maxRetries: 2,
});

/**
 * KERYX PERSONA — Single source of truth for all user-facing AI responses.
 * All prompt functions must include this constant as the ONLY high-level personality instruction.
 * Do NOT add "warm", "supportive", "life coach", or "non-judgmental" language to any function prompt.
 *
 * USER PROFILE:
 * The user is a 67-year-old retired IT/Enterprise Architect — a "Logical Guy" who values precision,
 * cleanliness, and high standards. He survived AFib and cancer and is actively rebuilding his
 * confidence at the motocross track (KTM rider) and billiards table. His kids and his app builds
 * are legitimate Big Wins he is proud of.
 *
 * TONE: Sharp IT consultant who has seen it all, mixed with a supportive but sarcastic crew chief.
 * Think peer-to-peer code review, not therapy. Deliver results over social friction.
 * Use dry humor when it fits naturally. Never be generic or robotic.
 *
 * BEHAVIORAL PROTOCOLS (apply when relevant):
 *
 * 1. "YES" LOGIC: If the user asks a binary question where both options are valid,
 *    answer "Yes." then roast their indecision briefly.
 *
 * 2. "DAAAAADDD! PROTOCOL": If the user is over-analyzing a loss (bad pool game, minor bug,
 *    messy kitchen), call it out directly. Remind them they are the Architect, not a victim
 *    of background processes.
 *
 * 3. "WEIGHTED WIN AUDITOR": When the user is complaining about small things (Pepsi-level problems),
 *    cite a Big Win to recalibrate — the KTM bike, his kids, a successful app build.
 *
 * 4. "NO GENERIC SHRUGS": When a search fails or the user is in a bad mood, diagnose it.
 *    "Your query logic is flawed" or "Your emotional CPU is overheating over a cache miss."
 *    Never respond with a hollow "I'm sorry, I couldn't find that."
 *
 * 5. "SYSTEM RESET": When the user is in a negative loop, break it with a well-placed joke.
 *    Target: "Okay, you got me."
 */
export const KERYX_PERSONA = `You are Keryx, a personal AI memory assistant with the personality of a sharp IT consultant who has seen it all — mixed with a supportive but sarcastic crew chief. Treat every interaction like a peer-to-peer code review: direct, precise, and occasionally funny.

USER PROFILE: 67-year-old retired IT/Enterprise Architect. AFib and cancer survivor. Rebuilding confidence at the motocross track (KTM rider) and billiards table. His legitimate Big Wins: his KTM bike, his kids, and his successful app builds.

TONE RULES:
- Be direct and precise. Results over social friction.
- Use dry humor when it fits. Never force it.
- Do NOT use hollow encouragement ("You're doing great!", "Every day is a new opportunity").
- Do NOT say "based on the data" or other AI meta-language — just answer.

BEHAVIORAL PROTOCOLS (apply when the situation calls for it):
1. BINARY QUESTIONS: If both options are valid, say "Yes." then briefly roast the indecision.
2. DAAAAADDD! PROTOCOL: If the user is over-analyzing a loss (bad pool game, minor bug, messy kitchen), call it out. "You're the Architect. Stop being a victim of your own background processes."
3. WEIGHTED WIN AUDITOR: When the user complains about small things, cite a real Big Win (KTM, kids, app builds) to recalibrate. Don't let Pepsi-level problems get KTM-level grief.
4. NO GENERIC SHRUGS: If a search fails or data is missing, diagnose it — "your query logic is flawed" or "your emotional CPU is overheating over a cache miss" — not "I'm sorry, I couldn't find that."
5. SYSTEM RESET: When the user is in a negative loop, land a joke that makes them say "Okay, you got me."`;

/**
 * AI reasoning for decisions - provides transparency
 */
export interface AIReasoning {
  topic?: string;  // Why this topic was chosen
  mood?: string;   // Why this mood was detected
  people?: string; // Why these people were identified
  calendar?: string; // Why this calendar event was linked
}

/**
 * Detected reminder from memory text
 */
export interface DetectedReminder {
  detected: boolean;
  content?: string;          // What to remind about
  triggerType?: 'time' | 'location';
  triggerTime?: string;      // ISO 8601 format for time-based reminders
  triggerLocationName?: string; // Place name for location-based reminders
}

/**
 * AI-extracted metadata structure
 */
export interface ExtractedMetadata {
  topicTag: string;
  metadataJson: Record<string, any>;
  mood: string;
  moodScore: number;
  detectedPeople: string[];
  aiReasoning?: AIReasoning;
  lifePurposeTheme?: boolean;
  importance?: number; // 1-10 scale, AI-assigned based on content significance
  reminderIntent?: DetectedReminder; // Detected reminder request
}

/**
 * Detected calendar event from memory text
 */
export interface DetectedCalendarEvent {
  detected: boolean;
  title?: string;
  startDateTime?: string;  // ISO 8601 format
  endDateTime?: string;    // ISO 8601 format
  attendees?: string[];
  location?: string;
  description?: string;
}

/**
 * Extract metadata from raw memory text using AI
 * Identifies topic and extracts structured data
 * 
 * @param memoryText - Raw voice-to-text transcription
 * @returns Promise<ExtractedMetadata> - Topic tag and structured metadata
 */
export async function extractMetadata(memoryText: string, userTimezone?: string): Promise<ExtractedMetadata> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a metadata extraction expert with emotional intelligence. Analyze the text and extract:

1. TOPIC: Identify the single most relevant topic tag from these categories (choose the BEST fit, only use General as last resort):
   - Work: Job tasks, career, projects, professional activities, workplace matters
   - Family: Spouse, children, parents, siblings, relatives, family events
   - Social: Friends, gatherings, parties, social events, community activities
   - Health: Medical appointments, fitness, exercise, wellness, mental health, symptoms
   - Financial: Bills, investments, budgets, expenses, money matters, subscriptions
   - Shopping: Purchases, errands, stores, online orders (excluding groceries)
   - Groceries: Grocery shopping, food purchases, supermarket runs
   - Travel: Trips, vacations, commutes, destinations, flights, hotels
   - Learning: Courses, reading, education, skills, training, studying
   - Home: Chores, maintenance, repairs, house projects, cleaning
   - Recreation: Hobbies, games, entertainment, sports (includes Billiards)
   - Food: Meals, restaurants, cooking, dining out (not grocery shopping)
   - Meeting: Appointments, scheduled calls, conferences, interviews
   - Personal: Reflections, goals, self-improvement, journaling, life thoughts
   - General: Only if none of the above categories fit

2. ENTITIES: Extract specific entities based on the topic:
   - Recreation: game details, activity, participants, duration
   - Groceries: store, items_list (as array), budget
   - Meeting: attendees (as array), action_items (as array), meeting_topic
   - Work: project, task, colleagues, deadline
   - Health: symptoms, medications, appointments, exercise_type
   - Any topic: extract relevant structured data you identify
   
For food/meal-related entries, use these EXACT field names:
   - meal_type: "breakfast" | "lunch" | "dinner" | "snack"
   - restaurant: name of restaurant
   - beverage: drink name
   - beverage_type: "soda" | "coffee" | "tea" | "juice" etc.
   - items: array of food items with details

3. MOOD: Detect the emotional tone of the entry. Choose ONE from:
   happy, sad, anxious, excited, neutral, frustrated, hopeful, grateful, stressed, peaceful, angry, confused, proud, nostalgic, motivated

4. MOOD SCORE: Rate the sentiment on a scale from -100 (extremely negative) to +100 (extremely positive). 0 is neutral.

5. PEOPLE: Extract all person names mentioned in the text. Include:
   - Full names when available
   - First names only if that's all that's mentioned
   - Nicknames if used as primary identifier
   Do NOT include generic references like "my friend" or "someone" - only actual names.

6. REASONING: For each decision, provide a brief explanation of why you made that choice. This helps users understand your logic.

7. LIFE PURPOSE THEME: Detect if the memory touches on existential or philosophical themes about life's purpose, meaning, or direction. Set to true if the person is:
   - Questioning their life purpose or meaning
   - Feeling lost about their direction in life
   - Contemplating what they should do with their life
   - Expressing uncertainty about their path or calling
   - Reflecting on deeper questions like "why am I here" or "what's my purpose"
   - Discussing finding meaning, fulfillment, or their life's work
   Set to false for general daily activities, tasks, or non-philosophical content.

8. IMPORTANCE: Rate the significance of this memory on a scale from 1 to 10:
   - 1-2: Trivial, routine, low-value (e.g., "I had toast for breakfast")
   - 3-4: Slightly notable but forgettable
   - 5: Average importance, typical daily activity
   - 6-7: Noteworthy, contains useful information or decisions
   - 8-9: Significant, involves important people, decisions, milestones, or emotions
   - 10: Critical, life-changing events, major decisions, breakthroughs
   Consider: emotional intensity, future relevance, uniqueness, people involved, decisions made, and potential impact.

9. REMINDER INTENT: Detect if the user is asking to be reminded about something. Look for phrases like:
   - "Remind me to..." or "remind me about..."
   - "Don't let me forget to..."
   - "Set a reminder for..." or "I need to remember to..."
   - "Remind me when I'm at..." (location-based)
   - "Remind me tomorrow/next week/in 2 hours..." (time-based)
   
   If a reminder is detected, extract:
   - content: What to remind about (the action or task)
   - triggerType: "time" for time-based, "location" for location-based
   - triggerTime: For time-based, convert to UTC and output in ISO 8601 format with Z suffix. IMPORTANT CONTEXT:
     * Current date/time in user's timezone (${userTimezone || 'UTC'}): ${userTimezone ? new Date().toLocaleString('en-US', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/(\d+)\/(\d+)\/(\d+),?\s+(.*)/, '$3-$1-$2T$4') : new Date().toISOString()}
     * Current UTC date/time: ${new Date().toISOString()}
     * When the user says "at 3pm", they mean 3pm in ${userTimezone || 'UTC'}.
     * You must CONVERT the user's local time to UTC and output with Z suffix.
     * Example: If user is in America/Denver (UTC-7) and says "at 3pm" on 2026-02-08, output "2026-02-08T22:00:00Z" (3pm + 7 hours = 10pm UTC)
     * "in 2 hours" → current UTC time + 2 hours with Z suffix
     * Always ensure the year is ${new Date().getFullYear()} or later, NEVER use past years
     * ALWAYS include the Z suffix to indicate UTC
   - triggerLocationName: For location-based, the place name (e.g., "gym", "grocery store", "office", "home")

Respond with JSON in this exact format: 
{
  "topicTag": "string",
  "metadataJson": { "field1": "value1", "field2": ["array", "values"], ... },
  "mood": "string (one of the mood options)",
  "moodScore": number (-100 to 100),
  "detectedPeople": ["name1", "name2", ...],
  "lifePurposeTheme": boolean,
  "importance": number (1 to 10),
  "reasoning": {
    "topic": "Brief explanation of why this topic was chosen",
    "mood": "Brief explanation of the emotional tone detected",
    "people": "Brief explanation of people identified (or 'No specific names mentioned')"
  },
  "reminderIntent": {
    "detected": boolean,
    "content": "string (what to remind about)",
    "triggerType": "time" | "location",
    "triggerTime": "ISO 8601 datetime string (for time-based)",
    "triggerLocationName": "string (for location-based)"
  }
}

If you cannot extract specific metadata, return empty object for metadataJson.
If no clear mood is detected, use "neutral" with moodScore 0.
If no people are mentioned, return empty array for detectedPeople.`,
        },
        {
          role: "user",
          content: memoryText,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 700,
      temperature: 0,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Parse reminder intent if detected
    let reminderIntent: DetectedReminder | undefined;
    if (result.reminderIntent?.detected) {
      reminderIntent = {
        detected: true,
        content: result.reminderIntent.content,
        triggerType: result.reminderIntent.triggerType,
        triggerTime: result.reminderIntent.triggerTime,
        triggerLocationName: result.reminderIntent.triggerLocationName,
      };
    }
    
    // Validate and normalize the result
    return {
      topicTag: result.topicTag || "General",
      metadataJson: result.metadataJson || {},
      mood: result.mood || "neutral",
      moodScore: typeof result.moodScore === 'number' ? Math.max(-100, Math.min(100, result.moodScore)) : 0,
      detectedPeople: Array.isArray(result.detectedPeople) ? result.detectedPeople : [],
      aiReasoning: result.reasoning ? {
        topic: result.reasoning.topic || undefined,
        mood: result.reasoning.mood || undefined,
        people: result.reasoning.people || undefined,
      } : undefined,
      lifePurposeTheme: result.lifePurposeTheme === true,
      importance: typeof result.importance === 'number' ? Math.max(1, Math.min(10, result.importance)) : 5,
      reminderIntent,
    };
  } catch (error) {
    console.error("Error extracting metadata:", error);
    // Fallback to General topic with empty metadata
    return {
      topicTag: "General",
      metadataJson: {},
      mood: "neutral",
      moodScore: 0,
      detectedPeople: [],
      importance: 5, // Default to middle importance
    };
  }
}

/**
 * Generate embedding vector for text using OpenAI's embedding model
 * Uses text-embedding-3-small which produces 1536-dimensional vectors
 * 
 * @param text - Text to generate embedding for
 * @returns Promise<number[]> - 1536-dimensional embedding vector (or zero vector fallback)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding, falling back to zero vector:", error);
    // Return a zero vector of correct dimensions (1536) as fallback
    // This allows memories to be saved even if OpenAI is unavailable
    // Semantic search won't work for these entries, but basic filtering will
    return new Array(1536).fill(0);
  }
}

/**
 * Intent detection result - determines if input is a log or query
 */
export interface DetectedIntent {
  intent: 'log' | 'query';
  confidence: number;
  reasoning: string;
}

/**
 * Detect whether user input is intended to log a new memory or query existing ones
 * Uses gpt-4o-mini for fast classification (typically <500ms)
 * 
 * @param inputText - Raw user input (voice or text)
 * @returns Promise<DetectedIntent> - Classified intent with confidence
 */
export async function detectIntent(inputText: string): Promise<DetectedIntent> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an intent classifier for a personal memory/journal system. Classify user input as either:

1. "log" - User wants to RECORD/SAVE a new memory, note, thought, event, or information
   Examples: "I just had lunch at Chipotle", "Meeting with John went well", "Remind me to call mom", "Had a great workout today", "I feel tired", "Bought groceries for $50"

2. "query" - User wants to SEARCH/RETRIEVE/ASK about existing memories
   Examples: "What did I eat yesterday?", "When was my last meeting with John?", "How much did I spend on groceries?", "Find my notes about the project", "What have I been doing this week?", "Show me my recent memories"

Key indicators for QUERY:
- Questions (what, when, where, how, who, did I, have I, etc.)
- Search terms (find, show, search, look up, tell me about)
- Past tense inquiries
- Requests for information retrieval

Key indicators for LOG:
- Statements about current or just-completed events
- Recording new information
- Expressing feelings or thoughts
- Noting tasks, reminders, observations

Respond with JSON: { "intent": "log" | "query", "confidence": 0.0-1.0, "reasoning": "brief explanation" }`
        },
        {
          role: "user",
          content: inputText
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 150,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      intent: result.intent === 'query' ? 'query' : 'log',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.8,
      reasoning: result.reasoning || 'Intent classified based on input structure'
    };
  } catch (error) {
    console.error("Error detecting intent:", error);
    // Default to log on error - safer to save than to search
    return {
      intent: 'log',
      confidence: 0.5,
      reasoning: 'Defaulted to log due to classification error'
    };
  }
}

/**
 * Query decomposition result
 */
export interface DecomposedQuery {
  semanticComponent: string; // High-level intent for vector search
  structuredFilters: {
    topicTag?: string;
    timestampFilter?: {
      start?: Date;
      end?: Date;
    };
    metadataFilters?: Record<string, any>;
  };
}

/**
 * Decompose a natural language query into semantic and structured components
 * Uses gpt-4o-mini for fast query parsing (1-2s vs 7s with gpt-5)
 * 
 * @param queryText - Natural language query from user
 * @returns Promise<DecomposedQuery> - Separated semantic intent and filters
 */
export async function decomposeQuery(queryText: string): Promise<DecomposedQuery> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a query parsing expert. Analyze the natural language query and separate it into:

1. semanticComponent: The high-level intent/question (e.g., "Who broke" from "Who broke for the first game on table two last Tuesday?")
2. structuredFilters: All filterable criteria:
   - topicTag: Topic if mentioned. Valid topics: Work, Family, Social, Health, Financial, Shopping, Groceries, Travel, Learning, Home, Recreation, Food, Meeting, Personal, General. OMIT if not explicitly mentioned — do NOT guess.
   - timestampFilter: ONLY include if the query contains an explicit time reference (e.g., "last week", "yesterday", "in March", "last month", "this morning").
     IMPORTANT: All time ranges are ROLLING WINDOWS relative to today, NOT calendar boundaries:
     - "last month" = today minus 30 days to today (NOT the calendar month of the previous month)
     - "last week" = today minus 7 days to today
     - "recently" = today minus 14 days to today
     - "this year" = today minus 365 days to today
     - If no date is mentioned, OMIT timestampFilter entirely — do not guess.
     - start: ISO date string
     - end: ISO date string (use today's date as end unless query implies otherwise)
   - metadataFilters: Specific field values using EXACT field names from common patterns:
     
     For food/meal queries use these EXACT field names:
     - meal_type: "breakfast" | "lunch" | "dinner" | "snack"
     - restaurant: name of restaurant
     - beverage: drink name
     - beverage_type: "soda" | "coffee" | "tea" | "juice" etc.
     
     For Recreation queries (games, hobbies, sports):
     - game, activity, participants, duration
     
     For Groceries queries:
     - store, items_list, budget
     
     For Meeting queries:
     - attendees, action_items, meeting_topic
     
     For Work queries:
     - project, task, colleagues, deadline
     
     For Health queries:
     - symptoms, medications, appointments, exercise_type

Respond with JSON in this exact format:
{
  "semanticComponent": "string describing the core question",
  "structuredFilters": {
    "topicTag": "string or omit",
    "timestampFilter": {
      "start": "ISO date string or omit",
      "end": "ISO date string or omit"
    },
    "metadataFilters": { "field": "value", ... }
  }
}

Today's date: ${new Date().toISOString()}`,
        },
        {
          role: "user",
          content: queryText,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Parse timestamp strings to Date objects if present
    const timestampFilter: { start?: Date; end?: Date } = {};
    if (result.structuredFilters?.timestampFilter?.start) {
      timestampFilter.start = new Date(result.structuredFilters.timestampFilter.start);
    }
    if (result.structuredFilters?.timestampFilter?.end) {
      timestampFilter.end = new Date(result.structuredFilters.timestampFilter.end);
    }

    return {
      semanticComponent: result.semanticComponent || queryText,
      structuredFilters: {
        topicTag: result.structuredFilters?.topicTag,
        timestampFilter: Object.keys(timestampFilter).length > 0 ? timestampFilter : undefined,
        metadataFilters: result.structuredFilters?.metadataFilters || {},
      },
    };
  } catch (error) {
    console.error("Error decomposing query:", error);
    // Fallback: treat entire query as semantic with no filters
    return {
      semanticComponent: queryText,
      structuredFilters: {},
    };
  }
}

/**
 * Synthesize a natural language answer from search results using the Keryx persona.
 * Safety valve: if memories don't answer the question, says so explicitly and
 * summarizes the closest match instead of hallucinating a connection.
 */
export async function synthesizeSearchAnswer(
  queryText: string,
  memories: Array<{ memoryText: string; timestamp?: Date | string; similarity?: number }>
): Promise<string> {
  try {
    if (memories.length === 0) {
      return "Nothing came back on that query. Either you haven't logged it, or your search terms are off — try broader keywords or a different angle. The system found no matches, not zero memories.";
    }

    const memorySummaries = memories
      .slice(0, 8) // Use top 8 for synthesis context
      .map((m, i) => {
        const when = m.timestamp ? new Date(m.timestamp as string).toLocaleDateString() : "unknown date";
        const score = m.similarity ? ` (${Math.round(m.similarity * 100)}% match)` : "";
        return `[${i + 1}] ${when}${score}: ${m.memoryText}`;
      })
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are answering a specific question using only the memories retrieved below. Follow these rules:

1. Answer directly and concisely using only what the memories show. Cite dates and specifics.
2. SAFETY VALVE: If the memories don't actually answer the question, say so directly — "I don't see that in your logs, but the closest thing I found was..." — then describe it. Do not invent connections or hallucinate a bridge.
3. If memories partially answer it, answer what you can and call out the gap.
4. Keep it to 3-5 sentences unless the question clearly needs more.
5. Apply the NO GENERIC SHRUGS protocol if the retrieved memories are weak or off-topic — diagnose why rather than apologizing.`,
        },
        {
          role: "user",
          content: `Question: ${queryText}\n\nRetrieved memories:\n${memorySummaries}`,
        },
      ],
      max_tokens: 400,
    });

    return response.choices[0].message.content?.trim() || "Retrieved memories but couldn't parse the synthesis — check the source cards below.";
  } catch (error) {
    console.error("Error synthesizing search answer:", error);
    return "Hit a snag generating the summary — your source memories are listed below.";
  }
}

/**
 * Thematic insights result
 */
export interface ThematicInsight {
  summary: string;
  patterns: string[];
  recommendations: string[];
  timespan: string;
}

/**
 * Generate thematic synthesis/insights from a collection of memories
 * Analyzes patterns, recurring themes, and provides actionable insights
 * 
 * @param memories - Array of memory objects with text and metadata
 * @param question - User's question about their memories (optional)
 * @returns Promise<ThematicInsight> - Synthesized insights
 */
export async function generateThematicInsights(
  memories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string; importance?: number }>,
  question?: string,
  activeGoals?: GoalContext[],
  userTimezone: string = 'America/Denver'
): Promise<ThematicInsight> {
  try {
    // Sort by importance (highest first) to prioritize critical memories
    const sortedMemories = [...memories].sort((a, b) => (b.importance || 5) - (a.importance || 5));
    
    // Prepare memory summary for context with importance labels
    // IMPORTANT: Convert timestamps to user's local timezone to avoid UTC date mismatch
    const memorySummary = sortedMemories.map((m, i) => {
      const importanceLabel = (m.importance || 5) >= 8 ? '[CRITICAL] ' : (m.importance || 5) >= 6 ? '[HIGH] ' : (m.importance || 5) <= 2 ? '[LOW] ' : '';
      const localDate = formatDateForTimezone(m.timestamp, userTimezone);
      return `${importanceLabel}[${i + 1}] ${localDate} | Importance: ${m.importance || 5}/10 | Mood: ${m.mood || 'unknown'} (${m.moodScore || 0}) | Topic: ${m.topicTag}\n"${m.memoryText}"`;
    }).join('\n\n');

    // Format goals context if available
    let goalsContext = '';
    if (activeGoals && activeGoals.length > 0) {
      goalsContext = `\n\nACTIVE GOALS (analyze how memories relate to these):\n${activeGoals.map(g => 
        `- "${g.title}" (${g.progressPercent}% complete)${g.description ? `: ${g.description}` : ''}`
      ).join('\n')}\n`;
    }

    // Use different system prompts based on whether user asked a specific question
    const systemPrompt = question 
      ? `${KERYX_PERSONA}

You are doing a system architecture review of the user's memories to answer a specific question.

IMPORTANCE WEIGHTING: Memories marked [CRITICAL] (8-10) and [HIGH] (6-7) are significant life events — weight them accordingly. [LOW] (1-2) memories are noise.

FOCUS YOUR ANSWER ON: "${question}"

Analyze the memories and answer directly. Your response should:
1. SUMMARY: Answer their specific question based on what the memories actually show — no padding.
2. PATTERNS: List the patterns from the memories that directly relate to their question.
3. RECOMMENDATIONS: Actionable next steps — not generic advice, specific to what the data shows.
4. TIMESPAN: The time period covered.

If the memories don't answer the question well, say so. Apply DAAAAADDD! Protocol if they're over-analyzing something trivial. Apply WEIGHTED WIN AUDITOR if they're missing the bigger picture.

Respond with JSON in this format:
{
  "summary": "A direct answer to their question based on the memories",
  "patterns": ["relevant pattern 1", "relevant pattern 2", ...],
  "recommendations": ["targeted suggestion 1", "targeted suggestion 2", ...],
  "timespan": "e.g., 'Last 30 days' or 'January - March 2024'"
}`
      : `${KERYX_PERSONA}

You are doing a peer architecture review of the user's memory logs. Treat it like reading a system's commit history — look for patterns, anti-patterns, and what the data is actually telling you.

IMPORTANCE WEIGHTING: Memories marked [CRITICAL] (8-10) and [HIGH] (6-7) are significant events — prioritize them. [LOW] (1-2) is noise.

Identify:
1. SUMMARY: What does this data actually show about this period? 2-3 sentences, direct.
2. PATTERNS: Recurring themes, behavioral patterns, emotional load — state them plainly.
3. RECOMMENDATIONS: Specific, actionable next steps based on patterns. Not generic encouragement.
4. TIMESPAN: The period covered.

Apply DAAAAADDD! Protocol for any loops of over-analysis in the patterns.
Apply WEIGHTED WIN AUDITOR if positive progress is being drowned out by noise.

Respond with JSON in this format:
{
  "summary": "A 2-3 sentence direct overview",
  "patterns": ["pattern 1", "pattern 2", ...],
  "recommendations": ["suggestion 1", "suggestion 2", ...],
  "timespan": "e.g., 'Last 30 days' or 'January - March 2024'"
}`;

    const userPrompt = question 
      ? `Here are my memories. Please answer my question: "${question}"\n\nMemories:\n${memorySummary}${goalsContext}`
      : `Analyze the following memories and identify patterns, themes, and insights:\n\n${memorySummary}${goalsContext}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "Unable to generate summary",
      patterns: Array.isArray(result.patterns) ? result.patterns : [],
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      timespan: result.timespan || "Unknown period",
    };
  } catch (error) {
    console.error("Error generating thematic insights:", error);
    return {
      summary: "Unable to analyze memories at this time.",
      patterns: [],
      recommendations: [],
      timespan: "Unknown",
    };
  }
}

/**
 * Email context for briefing
 */
export interface EmailContext {
  subject: string;
  from: string;
  snippet: string;
  date: Date;
}

/**
 * Financial summary for briefings
 */
export interface FinancialSummary {
  totalSpending: number;
  transactionCount: number;
  categoryBreakdown: Array<{ category: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
}

/**
 * Morning briefing result
 */
export interface MorningBriefing {
  greeting: string;
  summary: string;
  focusAreas: string[];
  reminders: string[];
  moodTrend: string;
  affirmation: string;
  emailHighlights?: string[];
  financialInsights?: string[];
  goalUpdates?: string[];
}

export interface GoalContext {
  title: string;
  description?: string | null;
  progressPercent: number;
  status: string;
  targetDate?: string | null;
  milestonesSummary?: string;
}

/**
 * Generate a personalized morning briefing based on recent memories, emails, and financial data
 * Provides context-aware daily summary with reminders, insights, and email highlights
 * 
 * @param recentMemories - Last 7 days of memories
 * @param userName - User's name for personalization
 * @param localHour - Local hour for time-of-day greeting
 * @param recentEmails - Recent emails to cross-reference with memories
 * @param activeProjects - Topics marked as current focus areas (prioritized in briefing)
 * @param financialSummary - Optional spending summary from connected financial accounts
 * @returns Promise<MorningBriefing>
 */
export interface PersonContext {
  name: string;
  relationship?: string | null;
  notes?: string | null;
}

export interface ReminderContext {
  content: string;
  triggerType: string;
  triggerTime?: string;
  triggerLocationName?: string;
}

export async function generateMorningBriefing(
  recentMemories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string; detectedPeople?: string[]; importance?: number }>,
  userName?: string,
  localHour?: number,
  recentEmails?: EmailContext[],
  activeProjects?: string[],
  financialSummary?: FinancialSummary,
  knownPeople?: PersonContext[],
  locationContext?: string,
  activeGoals?: GoalContext[],
  activeReminders?: ReminderContext[],
  userTimezone: string = 'America/Denver'
): Promise<MorningBriefing> {
  try {
    const hour = localHour ?? new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    
    // Sort by importance (highest first) to prioritize critical memories in briefings
    const sortedMemories = [...recentMemories].sort((a, b) => (b.importance || 5) - (a.importance || 5));
    
    // IMPORTANT: Convert timestamps to user's local timezone to avoid UTC date mismatch
    const memorySummary = sortedMemories.map((m, i) => {
      const importanceLabel = (m.importance || 5) >= 8 ? '[CRITICAL] ' : (m.importance || 5) >= 6 ? '[HIGH] ' : (m.importance || 5) <= 2 ? '[LOW] ' : '';
      const localDate = formatDateForTimezone(m.timestamp, userTimezone);
      return `${importanceLabel}[${localDate}] Importance: ${m.importance || 5}/10 | Mood: ${m.mood || 'neutral'} (${m.moodScore || 0}) | Topic: ${m.topicTag}${m.detectedPeople?.length ? ` | People: ${m.detectedPeople.join(', ')}` : ''}\n"${m.memoryText}"`;
    }).join('\n\n');

    // Extract people and topics from memories for email matching
    const mentionedPeople = new Set<string>();
    const topics = new Set<string>();
    recentMemories.forEach(m => {
      m.detectedPeople?.forEach(p => mentionedPeople.add(p.toLowerCase()));
      if (m.topicTag) topics.add(m.topicTag.toLowerCase());
    });

    // Format people context if available (user's relationship details)
    let peopleContext = '';
    if (knownPeople && knownPeople.length > 0) {
      const relevantPeople = knownPeople.filter(p => 
        p.relationship || p.notes
      );
      if (relevantPeople.length > 0) {
        peopleContext = `\n\nPEOPLE IN USER'S LIFE (use this to personalize mentions):\n${relevantPeople.map(p => 
          `- ${p.name}${p.relationship ? ` (${p.relationship})` : ''}${p.notes ? `: ${p.notes}` : ''}`
        ).join('\n')}`;
      }
    }

    // Format email context if available — include received date so AI can resolve relative references
    let emailContext = '';
    if (recentEmails && recentEmails.length > 0) {
      emailContext = `\n\nRECENT EMAILS (last 24-48 hours):\n${recentEmails.map(e => {
        const emailDate = e.date ? formatDateForTimezone(new Date(e.date), userTimezone) : 'unknown date';
        return `Received: ${emailDate} | From: ${e.from} | Subject: "${e.subject}"\nPreview: ${e.snippet}`;
      }).join('\n\n')}`;
    }

    // Format active projects context
    let activeProjectsContext = '';
    if (activeProjects && activeProjects.length > 0) {
      activeProjectsContext = `\n\nACTIVE FOCUS AREAS (prioritize these topics): ${activeProjects.join(', ')}`;
    }

    // Format financial context if available
    let financialContext = '';
    if (financialSummary && financialSummary.transactionCount > 0) {
      const topCategories = financialSummary.categoryBreakdown.slice(0, 3)
        .map(c => `${c.category}: $${c.amount.toFixed(2)}`).join(', ');
      const topSpending = financialSummary.topMerchants.slice(0, 3)
        .map(m => `${m.merchant}: $${m.amount.toFixed(2)}`).join(', ');
      financialContext = `\n\nFINANCIAL SUMMARY (last 7 days):\n- Total spending: $${financialSummary.totalSpending.toFixed(2)}\n- Transactions: ${financialSummary.transactionCount}\n- Top categories: ${topCategories}\n- Top merchants: ${topSpending}`;
    }

    // Format location context if available
    let locationCtx = '';
    if (locationContext && locationContext.trim()) {
      locationCtx = `\n\nLOCATION CONTEXT (places you frequent):\n${locationContext}`;
    }

    // Format goals context if available
    let goalsContext = '';
    if (activeGoals && activeGoals.length > 0) {
      goalsContext = `\n\nACTIVE GOALS (check if recent memories show progress toward these):\n${activeGoals.map(g => 
        `- "${g.title}" (${g.progressPercent}% complete)${g.targetDate ? ` - Target: ${g.targetDate}` : ''}${g.milestonesSummary ? `\n  Milestones: ${g.milestonesSummary}` : ''}`
      ).join('\n')}`;
    }
    
    // Format reminders context if available
    let remindersContext = '';
    if (activeReminders && activeReminders.length > 0) {
      remindersContext = `\n\nUSER-SET REMINDERS (include these in the REMINDERS section):\n${activeReminders.map(r => {
        if (r.triggerType === 'time' && r.triggerTime) {
          const dueLocal = formatDateTimeForTimezone(new Date(r.triggerTime), userTimezone);
          return `- [TIME] "${r.content}" - Due: ${dueLocal}`;
        } else if (r.triggerType === 'location' && r.triggerLocationName) {
          return `- [LOCATION] "${r.content}" - When at: ${r.triggerLocationName}`;
        }
        return `- "${r.content}"`;
      }).join('\n')}`;
    }

    // Build today's local date context so the AI can correctly label reminders
    const nowForBriefing = new Date();
    const briefingLocalDate = nowForBriefing.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD
    const briefingDayOfWeek = nowForBriefing.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long' });
    const briefingLocalTime = nowForBriefing.toLocaleTimeString('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit', hour12: true });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are generating a ${timeOfDay} briefing for ${userName || 'the user'}. This is their daily system status report — direct, factual, and useful. Skip the pleasantries. Lead with what matters.

TODAY'S DATE (user's local time): ${briefingLocalDate} (${briefingDayOfWeek})
CURRENT LOCAL TIME: ${briefingLocalTime}
USER'S TIMEZONE: ${userTimezone}

CRITICAL DATE RULES — READ CAREFULLY:
1. TODAY is ${briefingLocalDate} (${briefingDayOfWeek}). TOMORROW is the next calendar day. Never confuse UTC with the user's local date.
2. For REMINDERS listed in the USER-SET REMINDERS section: the due date is already in local time — compare it against TODAY above to determine "today"/"tomorrow"/"this Thursday" etc.
3. For appointments/events mentioned in EMAILS: each email shows its "Received" date. If an email says "your appointment is tomorrow", calculate from the email's received date, not from today. If an email says "your appointment is on [specific day/date]", use that specific date and compare to TODAY to determine "today"/"tomorrow"/"[day name]".
4. NEVER label an appointment as "today" unless its date matches ${briefingLocalDate} exactly. If unsure, use the specific day name (e.g., "Thursday") rather than relative terms.

CRITICAL FOCUS AREAS RULE — NO PATTERN INFERENCE FOR TODAY:
5. Do NOT infer or predict that a recurring activity happens TODAY based solely on memory patterns. Seeing several memories about "billiards league" does NOT mean there is billiards tonight. Seeing gym memories does NOT mean the user goes to the gym today. Memory patterns show habits over time — they do NOT confirm today's schedule.
6. A specific activity may only be stated as happening "today" or "tonight" if it appears explicitly in: (a) a USER-SET REMINDER dated today (${briefingLocalDate}), or (b) a calendar event for today. Without one of these, use non-time-specific language: "Continue attending billiards league as usual" rather than "Prepare for billiards league tonight."
7. Pattern-based insights are welcome in FOCUS_AREAS (e.g., "You've been consistent with your billiards league practice") but must never predict today's schedule from patterns alone.

Based on their recent memories${recentEmails?.length ? ', emails' : ''}${financialSummary ? ', and spending data' : ''}${locationContext ? ', location patterns' : ''}${activeProjects?.length ? ', with special attention to their active focus areas' : ''}${knownPeople?.length ? ', and knowledge about people in their life' : ''}${activeGoals?.length ? ', and their active goals' : ''}${activeReminders?.length ? ', and their set reminders' : ''}, create a personalized briefing that:

IMPORTANCE WEIGHTING: Memories are marked with importance levels (1-10). Give MORE weight and attention to memories marked [CRITICAL] (8-10) and [HIGH] (6-7). These represent significant life events, decisions, or concerns. Memories marked [LOW] (1-2) are minor/trivial. Default importance is 5.
1. GREETING: A direct opening — acknowledge the time of day and any notable status. No hollow cheerfulness. A dry observation is fine.
2. SUMMARY: What's actually been happening. 2-3 sentences, no padding.
3. FOCUS_AREAS: What matters today based on patterns and pending items. Be specific — no generic "stay focused" filler.
4. REMINDERS: Actual follow-ups that need attention. State them plainly.
5. MOOD_TREND: A direct read on their emotional patterns — treat it like a system health metric, not a therapy note.
6. AFFIRMATION: One useful observation, not a bumper sticker. Apply WEIGHTED WIN AUDITOR if the mood data is too negative — cite a real win.
${recentEmails?.length ? `7. EMAIL_HIGHLIGHTS: 1-3 emails that genuinely connect to people or topics from their memories. Skip ones that don't connect — don't force it.` : ''}
${financialSummary ? `8. FINANCIAL_INSIGHTS: 1-2 factual spending observations. Data first. If something is worth noting, note it directly — no softening.` : ''}
${activeGoals?.length ? `9. GOAL_UPDATES: For each active goal, what do the memories actually show? Report accurately. Apply DAAAAADDD! Protocol if they're stuck in analysis on a stalled goal.` : ''}

IMPORTANT: When people are mentioned in memories, ALWAYS check the "PEOPLE IN USER'S LIFE" section to understand their relationship. Use relationship context to be specific — "your daughter Kim", not just "Kim".

Respond with JSON:
{
  "greeting": "personalized greeting",
  "summary": "what's been happening",
  "focusAreas": ["area 1", "area 2", ...],
  "reminders": ["reminder 1", "reminder 2", ...],
  "moodTrend": "observation about their emotional state",
  "affirmation": "encouraging statement"${recentEmails?.length ? `,
  "emailHighlights": ["Email from X about Y relates to your project...", ...]` : ''}${financialSummary ? `,
  "financialInsights": ["You spent $X on Y this week...", ...]` : ''}${activeGoals?.length ? `,
  "goalUpdates": ["Your 'Learn Spanish' goal (30%) - You mentioned practicing this week!", ...]` : ''}
}`
        },
        {
          role: "user",
          content: recentMemories.length > 0 
            ? `Here are my recent memories from the past week:\n\n${memorySummary}${peopleContext}${activeProjectsContext}${emailContext}${financialContext}${locationCtx}${goalsContext}${remindersContext}\n\nGenerate my ${timeOfDay} briefing.`
            : `I don't have any recent memories logged.${peopleContext}${activeProjectsContext}${emailContext}${financialContext}${locationCtx}${goalsContext}${remindersContext}\n\nGenerate a welcoming ${timeOfDay} briefing encouraging me to start logging.`
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      greeting: result.greeting || `Good ${timeOfDay}!`,
      summary: result.summary || "Start logging memories to get personalized insights.",
      focusAreas: Array.isArray(result.focusAreas) ? result.focusAreas : [],
      reminders: Array.isArray(result.reminders) ? result.reminders : [],
      moodTrend: result.moodTrend || "Log some memories to track your emotional patterns.",
      affirmation: result.affirmation || "Every day is a new opportunity.",
      emailHighlights: Array.isArray(result.emailHighlights) ? result.emailHighlights : undefined,
      financialInsights: Array.isArray(result.financialInsights) ? result.financialInsights : undefined,
      goalUpdates: Array.isArray(result.goalUpdates) ? result.goalUpdates : undefined,
    };
  } catch (error) {
    console.error("Error generating morning briefing:", error);
    const fallbackHour = localHour ?? new Date().getHours();
    const fallbackTime = fallbackHour < 12 ? "Morning" : fallbackHour < 17 ? "Afternoon" : "Evening";
    return {
      greeting: `${fallbackTime}.`,
      summary: "Briefing generation hit an error. Check the logs.",
      focusAreas: [],
      reminders: [],
      moodTrend: "Log some entries to get a read on your patterns.",
      affirmation: "System is back up. Pick up where you left off.",
    };
  }
}

/**
 * Pattern alert result
 */
export interface PatternAlert {
  type: "positive" | "negative" | "neutral" | "insight";
  title: string;
  description: string;
  actionSuggestion?: string;
}

/**
 * Detect patterns in memories and generate alerts
 * 
 * @param memories - Recent memories to analyze
 * @returns Promise<PatternAlert[]>
 */
export async function detectPatternAlerts(
  memories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string }>,
  userTimezone: string = 'America/Denver'
): Promise<PatternAlert[]> {
  try {
    if (memories.length < 5) {
      return []; // Need sufficient data for pattern detection
    }

    // IMPORTANT: Convert timestamps to user's local timezone to avoid UTC date mismatch
    const memorySummary = memories.map((m) => {
      const localDate = formatDateForTimezone(m.timestamp, userTimezone);
      return `[${localDate}] ${m.mood || 'neutral'} (${m.moodScore || 0}) | ${m.topicTag}: "${m.memoryText}"`;
    }).join('\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are reviewing the user's memory log for significant patterns worth flagging — like a senior dev doing a code review on a commit history. Surface what's actually significant. Skip the noise.

Identify 0-3 notable patterns:
- POSITIVE: Good habits, improving trends, real achievements
- NEGATIVE: Concerning patterns, declining mood, stress load building up
- NEUTRAL: Interesting signals without clear valence
- INSIGHT: Non-obvious connections that might shift perspective

For each pattern:
- type: "positive" | "negative" | "neutral" | "insight"
- title: 5-8 words max — direct, not clinical
- description: 1-2 sentences, plain language. Apply DAAAAADDD! Protocol for negative patterns that are over-analyzed trivialities. Apply WEIGHTED WIN AUDITOR if positive progress is being buried by noise.
- actionSuggestion: Optional — only include if it's actually useful, not filler.

Only flag genuinely significant patterns. Empty array is fine.

Respond with JSON:
{
  "alerts": [
    { "type": "...", "title": "...", "description": "...", "actionSuggestion": "..." }
  ]
}`
        },
        {
          role: "user",
          content: `Analyze these recent memories for patterns:\n\n${memorySummary}`
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return Array.isArray(result.alerts) ? result.alerts : [];
  } catch (error) {
    console.error("Error detecting patterns:", error);
    return [];
  }
}

/**
 * Detect if memory text describes a future calendar event
 * Extracts event details if detected
 * 
 * @param memoryText - Raw memory text to analyze
 * @param currentDate - Current date for context (defaults to now)
 * @returns Promise<DetectedCalendarEvent> - Detected event details or { detected: false }
 */
export async function detectCalendarEvent(
  memoryText: string,
  currentDate: Date = new Date(),
  userTimezone: string = 'UTC'
): Promise<DetectedCalendarEvent> {
  // Build local date context so AI knows the user's actual day/time
  const now = currentDate;
  const localDate = now.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD
  const localTime = now.toLocaleTimeString('en-US', {
    timeZone: userTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const localDayOfWeek = now.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that detects future events from natural language.
Analyze the text to determine if it describes a FUTURE calendar event (meeting, appointment, gathering, call, etc.).

USER'S LOCAL DATE: ${localDate}
USER'S LOCAL TIME: ${localTime}
USER'S DAY OF WEEK: ${localDayOfWeek}
USER'S TIMEZONE: ${userTimezone}

CRITICAL DATETIME RULES:
1. Always calculate relative dates (today, tomorrow, Saturday, next week, etc.) from the USER'S LOCAL DATE and DAY OF WEEK shown above — never from UTC.
2. All datetimes you return MUST be in the user's LOCAL time as plain ISO 8601 WITHOUT a Z suffix or timezone offset (e.g. "2026-03-07T08:00:00" not "2026-03-07T15:00:00Z"). The calendar system will apply the user's timezone automatically.
3. Only detect FUTURE events (not past events or general statements).
4. If dates are relative ("tomorrow", "next Tuesday", "in 2 weeks"), calculate the actual date from USER'S LOCAL DATE above.
5. If no specific time is mentioned, use reasonable defaults:
   - Morning meetings: 9:00 AM
   - Lunch: 12:00 PM  
   - Afternoon: 2:00 PM
   - Dinner: 7:00 PM
   - Default duration: 1 hour
6. Extract all attendee names mentioned.
7. Extract location if mentioned.

Respond with JSON:
{
  "detected": true/false,
  "title": "Event title based on context",
  "startDateTime": "YYYY-MM-DDTHH:mm:ss (local time, no Z, no offset)",
  "endDateTime": "YYYY-MM-DDTHH:mm:ss (local time, no Z, no offset)",
  "attendees": ["name1", "name2"],
  "location": "location if mentioned",
  "description": "Brief context from the memory"
}

If no future event is detected, respond with just: { "detected": false }`
        },
        {
          role: "user",
          content: memoryText
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    if (!result.detected) {
      return { detected: false };
    }

    return {
      detected: true,
      title: result.title || "New Event",
      startDateTime: result.startDateTime,
      endDateTime: result.endDateTime,
      attendees: Array.isArray(result.attendees) ? result.attendees : [],
      location: result.location || undefined,
      description: result.description || memoryText.substring(0, 200),
    };
  } catch (error) {
    console.error("Error detecting calendar event:", error);
    return { detected: false };
  }
}

/**
 * Transaction data for financial query context
 */
export interface TransactionContext {
  date: Date;
  amount: number;
  merchantName: string | null;
  name: string;
  primaryCategory: string | null;
}

/**
 * Answer a user's question about their financial data
 * Uses AI to provide natural language responses about spending patterns
 * 
 * @param query - User's question about finances
 * @param transactions - Recent transaction data
 * @param accounts - Account balance information
 * @returns Promise<string> - Natural language answer
 */
export async function answerFinancialQuery(
  query: string,
  transactions: TransactionContext[],
  accounts: Array<{ name: string; type: string; currentBalance: number | null; availableBalance: number | null }>
): Promise<{ answer: string; summary?: { totalSpent: number; transactionCount: number; topCategories: string[] } }> {
  try {
    if (transactions.length === 0 && accounts.length === 0) {
      return {
        answer: "I don't have any financial data to analyze yet. Please connect a bank account and sync your transactions in Settings."
      };
    }

    // Calculate summary stats
    const totalSpent = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const categoryTotals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.amount > 0 && t.primaryCategory) {
        categoryTotals[t.primaryCategory] = (categoryTotals[t.primaryCategory] || 0) + t.amount;
      }
    }
    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    // Format transaction context
    const transactionSummary = transactions.length > 0 
      ? transactions.slice(0, 50).map(t => 
          `${t.date.toISOString().split('T')[0]} | $${t.amount.toFixed(2)} | ${t.merchantName || t.name} | ${t.primaryCategory || 'uncategorized'}`
        ).join('\n')
      : 'No transactions';

    const accountSummary = accounts.length > 0
      ? accounts.map(a => 
          `${a.name} (${a.type}): Balance $${(a.currentBalance || 0).toFixed(2)}${a.availableBalance !== a.currentBalance ? ` (Available: $${(a.availableBalance || 0).toFixed(2)})` : ''}`
        ).join('\n')
      : 'No accounts';

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are reviewing the user's financial data like a senior consultant reviewing an expense report. Data first, tone second. Lead with the numbers, then the observation.

Available data:
- Transactions from the last 30 days
- Connected account balances

Rules:
- Answer with the actual data. "You spent $X at Y" not "It looks like there may have been some spending..."
- Keep answers concise (2-4 sentences) unless the question needs more.
- If something isn't in the data, say so directly — what you can see, what you can't.
- Do NOT soften spending observations. Facts are facts. Apply WEIGHTED WIN AUDITOR if small spending concerns are overshadowing the full picture.`
        },
        {
          role: "user",
          content: `ACCOUNTS:\n${accountSummary}\n\nRECENT TRANSACTIONS (last 30 days, ${transactions.length} total, $${totalSpent.toFixed(2)} spent):\n${transactionSummary}\n\nUSER QUESTION: ${query}`
        },
      ],
    });

    return {
      answer: response.choices[0].message.content || "I couldn't analyze that question. Please try rephrasing.",
      summary: {
        totalSpent: Math.round(totalSpent * 100) / 100,
        transactionCount: transactions.length,
        topCategories
      }
    };
  } catch (error) {
    console.error("Error answering financial query:", error);
    return {
      answer: "I encountered an error analyzing your financial data. Please try again."
    };
  }
}

/**
 * Personal News Story structure for cognitive insights
 */
export interface PersonalNewsStory {
  id: string;
  category: 'people' | 'projects' | 'calendar' | 'financial' | 'wellbeing' | 'highlights';
  headline: string;
  summary: string;
  details?: string;
  relatedItems?: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'celebratory';
  priority: 'breaking' | 'featured' | 'standard';
  icon?: string;
}

/**
 * Personal News Feed result
 */
export interface PersonalNewsFeed {
  stories: PersonalNewsStory[];
  generatedAt: Date;
  dataSources: {
    memories: number;
    calendars: number;
    emails: number;
    financial: boolean;
    location: boolean;
  };
}

/**
 * Calendar event context for news generation
 */
export interface CalendarContext {
  title: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
}

/**
 * Generate a personalized news feed from user's Keryx ecosystem
 * Creates news-style stories from memories, calendar events, emails, and financial data
 */
export async function generatePersonalNewsFeed(
  recentMemories: Array<{ 
    memoryText: string; 
    mood?: string; 
    moodScore?: number; 
    timestamp: Date; 
    topicTag: string; 
    detectedPeople?: string[];
    importance?: number;
  }>,
  upcomingEvents?: CalendarContext[],
  recentEmails?: EmailContext[],
  financialSummary?: FinancialSummary,
  userName?: string,
  userTimezone: string = 'UTC',
  knownPeople?: PersonContext[],
  locationContext?: string,
  activeGoals?: GoalContext[]
): Promise<PersonalNewsFeed> {
  try {
    const formatDateInTimezone = (date: Date, tz: string) => {
      return new Date(date).toLocaleDateString('en-US', { 
        timeZone: tz, 
        weekday: 'long',
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
    };
    
    const formatTimeInTimezone = (date: Date, tz: string) => {
      return new Date(date).toLocaleTimeString('en-US', { 
        timeZone: tz, 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
    };

    // Sort by importance (highest first) to prioritize critical memories in news feed
    const sortedMemories = [...recentMemories].sort((a, b) => (b.importance || 5) - (a.importance || 5));
    
    // IMPORTANT: Convert timestamps to user's local timezone to avoid UTC date mismatch
    const memorySummary = sortedMemories.map((m, i) => {
      const importanceLabel = (m.importance || 5) >= 8 ? '[CRITICAL] ' : (m.importance || 5) >= 6 ? '[HIGH] ' : (m.importance || 5) <= 2 ? '[LOW] ' : '';
      const localDate = formatDateForTimezone(m.timestamp, userTimezone);
      return `${importanceLabel}[${localDate}] Importance: ${m.importance || 5}/10 | Mood: ${m.mood || 'neutral'} (${m.moodScore || 0}) | Topic: ${m.topicTag}${m.detectedPeople?.length ? ` | People: ${m.detectedPeople.join(', ')}` : ''}\n"${m.memoryText}"`;
    }).join('\n\n');

    const nowInUserTz = new Date().toLocaleString('en-US', { timeZone: userTimezone });
    const userLocalDate = new Date(nowInUserTz);
    const todayStr = formatDateInTimezone(new Date(), userTimezone);

    const getDayLabel = (eventDate: Date) => {
      const eventLocal = new Date(eventDate.toLocaleString('en-US', { timeZone: userTimezone }));
      const todayLocal = new Date(userLocalDate);
      todayLocal.setHours(0, 0, 0, 0);
      eventLocal.setHours(0, 0, 0, 0);
      const diffDays = Math.round((eventLocal.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return '(TODAY)';
      if (diffDays === 1) return '(TOMORROW)';
      if (diffDays === -1) return '(YESTERDAY)';
      const dayName = eventDate.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long' }).toUpperCase();
      if (diffDays >= 2) return `(THIS ${dayName})`;
      if (diffDays <= -2) return `(${Math.abs(diffDays)} DAYS AGO)`;
      return '';
    };

    let calendarContext = '';
    if (upcomingEvents && upcomingEvents.length > 0) {
      calendarContext = `\n\nTODAY'S DATE (user's local time): ${todayStr}\nCURRENT DAY: ${userLocalDate.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long' })}\n\nUPCOMING CALENDAR EVENTS (next 3 days):\n${upcomingEvents.map(e => {
        const eventDate = formatDateInTimezone(new Date(e.startTime), userTimezone);
        const dayLabel = getDayLabel(new Date(e.startTime));
        return `- ${e.title} on ${eventDate} ${dayLabel} at ${formatTimeInTimezone(new Date(e.startTime), userTimezone)}${e.attendees?.length ? ` with ${e.attendees.join(', ')}` : ''}${e.location ? ` at ${e.location}` : ''}`;
      }).join('\n')}`;
    }

    let emailContext = '';
    if (recentEmails && recentEmails.length > 0) {
      emailContext = `\n\nRECENT EMAILS:\n${recentEmails.map(e => 
        `From: ${e.from} | Subject: "${e.subject}"\nPreview: ${e.snippet}`
      ).join('\n\n')}`;
    }

    let financialContext = '';
    if (financialSummary && financialSummary.transactionCount > 0) {
      const topCategories = financialSummary.categoryBreakdown.slice(0, 5)
        .map(c => `${c.category}: $${c.amount.toFixed(2)}`).join(', ');
      const topMerchants = financialSummary.topMerchants.slice(0, 5)
        .map(m => `${m.merchant}: $${m.amount.toFixed(2)}`).join(', ');
      financialContext = `\n\nFINANCIAL ACTIVITY (last 7 days):\n- Total spending: $${financialSummary.totalSpending.toFixed(2)}\n- Transactions: ${financialSummary.transactionCount}\n- Categories: ${topCategories}\n- Merchants: ${topMerchants}`;
    }

    // Format people context if available (user's relationship details)
    let peopleContext = '';
    if (knownPeople && knownPeople.length > 0) {
      const relevantPeople = knownPeople.filter(p => 
        p.relationship || p.notes
      );
      if (relevantPeople.length > 0) {
        peopleContext = `\n\nPEOPLE IN USER'S LIFE (use this to personalize mentions - refer to people by their relationship when known):\n${relevantPeople.map(p => 
          `- ${p.name}${p.relationship ? ` (${p.relationship})` : ''}${p.notes ? `: ${p.notes}` : ''}`
        ).join('\n')}`;
      }
    }

    // Format location context if available
    let locationCtx = '';
    if (locationContext && locationContext.trim()) {
      locationCtx = `\n\nLOCATION PATTERNS (places they frequent):\n${locationContext}`;
    }

    // Format goals context if available
    let goalsContext = '';
    if (activeGoals && activeGoals.length > 0) {
      goalsContext = `\n\nACTIVE GOALS (include progress updates in relevant stories):\n${activeGoals.map(g => 
        `- "${g.title}" (${g.progressPercent}% complete)${g.description ? `: ${g.description}` : ''}`
      ).join('\n')}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are generating a personal news feed for ${userName || 'the user'} — a "Local News" report about their life ecosystem. Their memories, calendars, emails, and finances are your sources. Write it like a sharp news editor: accurate, specific, direct. No fluff.

The user's timezone is ${userTimezone}. All dates in the memory data are in local time.

Generate 4-8 news-style stories from the data provided. Each story should read like a brief news article about their life:

STORY CATEGORIES:
- people: Stories about relationships, interactions with specific people mentioned in memories
- projects: Updates on ongoing work, hobbies, or activities they're tracking
- calendar: Upcoming events, meetings, or things to prepare for
- financial: Spending patterns, notable purchases, budget observations
- wellbeing: Mood trends, self-care patterns, health-related observations
- highlights: Notable achievements, milestones, or positive moments
- location: Location-based observations (places visited, routine patterns, travel activity)

CRITICAL TIMING RULES FOR CALENDAR EVENTS:
- Each calendar event has a day label in parentheses: (TODAY), (TOMORROW), (YESTERDAY), (THIS WEDNESDAY), or (X DAYS AGO), etc.
- You MUST use exactly these labels when referring to events. Do NOT compute your own relative dates.
- If an event says "(TODAY)", say "today" in the headline/summary.
- If an event says "(TOMORROW)", say "tomorrow" in the headline/summary.
- If an event says "(THIS THURSDAY)", say "this Thursday" in the headline/summary.
- If an event says "(YESTERDAY)", say "yesterday" in the headline/summary — NEVER say "today" for a (YESTERDAY) event.
- If an event says "(X DAYS AGO)", it is in the past — frame it accordingly in past tense.
- NEVER say "tomorrow" for an event that is labeled "(THIS THURSDAY)" or any other non-tomorrow label.
- Events labeled (YESTERDAY) or (X DAYS AGO) are PAST events. They must NEVER use priority "breaking". Use "standard" at most. Do NOT generate a breaking story about a past event that no longer requires immediate action.

CRITICAL PEOPLE RULES — PHYSICAL PRESENCE VS. REMOTE COMMUNICATION:
- A person is physically present ONLY if the memory text EXPLICITLY says so with words like: "cooked with [name]", "[name] came over", "had lunch with [name]", "[name] was here", "we went together", "[name] helped me", etc.
- If the memory says "texted [name]", "called [name]", "messaged [name]", "talked to [name] on the phone", "thinking about [name]", or simply mentions a name in passing, that person was NOT physically there.
- NEVER write a headline or summary implying someone physically joined, helped with, or participated in an activity when the memory only shows remote communication, a text/message, or a passive mention.
- WRONG: Memory says "texted Michael while making dinner" → do NOT write "Michael Joins You in Kitchen Adventures" or "Son Michael Helps in the Kitchen."
- RIGHT: For that memory, you may note the user was cooking and separately that they were in touch with their son — but keep them as two distinct observations, not one co-activity story.

CRITICAL RULE — DO NOT USE RELATIVE WORDS FROM INSIDE QUOTED MEMORY TEXT:
- Every memory entry begins with a [Date] label (e.g., [Tuesday, March 3, 2026]). Use ONLY that date label to determine recency.
- Memory text is quoted from what the user said at the time of logging. Words like "today", "yesterday", "this morning" inside a memory's quoted text reflect when the user was speaking — they are NOT reliable indicators of when the story is being generated.
- NEVER use relative words ("today", "yesterday", "this morning") from inside quoted memory text to set the timeframe of a story.
- ONLY use relative time words in stories when they come from the structured calendar labels: (TODAY), (TOMORROW), (YESTERDAY).

STORY PRIORITIES:
- breaking: Time-sensitive or very important (upcoming event TODAY or TOMORROW, urgent email)
- featured: Significant patterns or notable events (mood improvements, project milestones)
- standard: Regular updates, observations, and anything that happened in the past

STORY SENTIMENTS:
- positive: Good news, achievements, improvements
- neutral: Informational updates, reminders
- negative: Concerns that need attention
- celebratory: Milestones, achievements worth celebrating

WRITING STYLE:
- Write headlines like a newspaper: concise, engaging, present tense
- Summaries: 1-2 sentences, factual and specific
- Reference actual names, dates, and specifics from the data
- Accurate and direct — data is data. No "never judgmental" softening.
- Apply WEIGHTED WIN AUDITOR if small-issue stories are drowning out genuine achievements.
- Use past tense for events that already happened (YESTERDAY or older)

Example stories:
- Headline: "Catch-Up with Sarah Scheduled for Tomorrow"
  Summary: "Coffee meeting with Sarah tomorrow at 10 AM at Blue Bottle. You last mentioned her 3 days ago in a positive context."
  
- Headline: "Weekend Productivity Streak Continues"
  Summary: "Mood scores up 20% since Monday. Most positive memories centered around project work — the system is working."

- Headline: "Healthcare Appointment Was Cancelled Yesterday"
  Summary: "Oak St. Health appointment cancelled yesterday, leaving an open slot." (priority: standard, NOT breaking)

IMPORTANT: When people are mentioned, ALWAYS check the "PEOPLE IN USER'S LIFE" section to understand their relationship. Use it — "your daughter Kim", not just "Kim".

Respond with JSON:
{
  "stories": [
    {
      "id": "unique-id",
      "category": "people|projects|calendar|financial|wellbeing|highlights|location",
      "headline": "Newspaper-style headline",
      "summary": "1-2 sentence summary",
      "details": "Optional additional context",
      "relatedItems": ["related memory or event"],
      "sentiment": "positive|neutral|negative|celebratory",
      "priority": "breaking|featured|standard",
      "icon": "emoji that fits the story"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Generate my personal news feed based on this data from my Keryx ecosystem:\n\nRECENT MEMORIES (last 7 days):\n${memorySummary || 'No recent memories.'}${peopleContext}${calendarContext}${emailContext}${financialContext}${locationCtx}${goalsContext}\n\nCreate news stories that synthesize insights across these data sources.`
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      stories: Array.isArray(result.stories) ? result.stories.map((s: PersonalNewsStory, i: number) => ({
        id: s.id || `story-${i}`,
        category: s.category || 'highlights',
        headline: s.headline || 'Update',
        summary: s.summary || '',
        details: s.details,
        relatedItems: s.relatedItems,
        sentiment: s.sentiment || 'neutral',
        priority: s.priority || 'standard',
        icon: s.icon,
      })) : [],
      generatedAt: new Date(),
      dataSources: {
        memories: recentMemories.length,
        calendars: upcomingEvents?.length || 0,
        emails: recentEmails?.length || 0,
        financial: !!financialSummary,
        location: !!locationContext,
      }
    };
  } catch (error) {
    console.error("Error generating personal news feed:", error);
    return {
      stories: [],
      generatedAt: new Date(),
      dataSources: {
        memories: recentMemories.length,
        calendars: 0,
        emails: 0,
        financial: false,
        location: false,
      }
    };
  }
}

/**
 * Goal progress analysis result
 */
export interface GoalProgressAnalysis {
  progressPercent: number;
  summary: string;
  relatedMemoryIds: string[];
  suggestions: string[];
  achievements: string[];
  blockers: string[];
}

/**
 * Analyze goal progress by examining user memories
 */
export async function analyzeGoalProgress(
  goal: { id: string; title: string; description: string | null; progressPercent: number; milestones: any[] },
  recentMemories: Array<{ id?: string; memoryText: string; timestamp?: Date; topicTag?: string }>
): Promise<GoalProgressAnalysis> {
  try {
    const memoriesContext = recentMemories.slice(0, 50).map(m => 
      `- ${m.memoryText}`
    ).join('\n');

    const milestonesContext = Array.isArray(goal.milestones) && goal.milestones.length > 0
      ? goal.milestones.map((m: any) => `- ${m.title} (${m.isCompleted ? 'completed' : 'pending'})`).join('\n')
      : 'No milestones defined';

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${KERYX_PERSONA}

You are doing a quarterly metrics review of this goal. Senior consultant mode: read what the memories actually show, call it accurately, and give specific next steps. No cheerleading.

IMPORTANT: "Current Progress" is a manually set tracker (0-100%) showing how far along the user is — it does NOT represent the actual value of the goal's metric. If the goal is "Achieve a 70% win rate" and progress is 70%, that means 70% through the journey, NOT that they have a 70% win rate. Never confuse the progress percentage with the goal's target metric.

Examine the memories and determine:
1. What evidence of actual progress exists (real metric data, practice sessions, measurable outcomes)
2. Which memories show that evidence
3. What achievements are confirmed by the data
4. Any blockers or challenges — name them plainly
5. Specific next steps (not generic encouragement)

CRITICAL: Do NOT say the user has "reached" or "achieved" the goal unless the memories clearly show it. Only claim goal achieved if there is direct evidence. Be accurate.
Apply DAAAAADDD! Protocol if the memories show the user dwelling on a single setback instead of the overall trend.
Apply WEIGHTED WIN AUDITOR if the blockers list is growing while real progress is being ignored.

Respond in JSON format:
{
  "progressPercent": <number 0-100 — only adjust if memories clearly show significant change; otherwise keep close to current progress>,
  "summary": "<2-3 sentence direct summary of actual progress based on memory evidence>",
  "relatedMemoryIndices": [<indices of memories that show progress, 0-based>],
  "achievements": ["<achievement 1>", "<achievement 2>"],
  "blockers": ["<blocker 1>"],
  "suggestions": ["<specific next step 1>", "<specific next step 2>"]
}`
        },
        {
          role: "user",
          content: `Goal: ${goal.title}
Description: ${goal.description || 'No description'}
Current Progress (manually tracked, 0-100% of journey — NOT the metric value): ${goal.progressPercent}%
Milestones:
${milestonesContext}

Recent Memories (look here for actual evidence of metric progress):
${memoriesContext || 'No recent memories'}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const result = JSON.parse(content);
    
    const relatedMemoryIds = (result.relatedMemoryIndices || [])
      .filter((i: number) => i >= 0 && i < recentMemories.length && recentMemories[i]?.id)
      .map((i: number) => recentMemories[i].id as string);

    return {
      progressPercent: Math.max(0, Math.min(100, result.progressPercent || goal.progressPercent)),
      summary: result.summary || 'Analysis in progress',
      relatedMemoryIds,
      suggestions: result.suggestions || [],
      achievements: result.achievements || [],
      blockers: result.blockers || [],
    };
  } catch (error) {
    console.error("Error analyzing goal progress:", error);
    return {
      progressPercent: goal.progressPercent,
      summary: 'Unable to analyze progress at this time',
      relatedMemoryIds: [],
      suggestions: [],
      achievements: [],
      blockers: [],
    };
  }
}

/**
 * Suggested milestone structure
 */
export interface SuggestedMilestone {
  title: string;
  description: string;
  estimatedEffort: string;
}

/**
 * Suggest milestones for a goal
 */
export async function suggestGoalMilestones(
  goal: { title: string; description: string | null; milestones: any[] }
): Promise<SuggestedMilestone[]> {
  try {
    const existingMilestones = Array.isArray(goal.milestones) && goal.milestones.length > 0
      ? goal.milestones.map((m: any) => m.title).join(', ')
      : 'None';

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps break down goals into achievable milestones.
Generate 3-5 concrete, actionable milestones that would help achieve the goal.
Each milestone should be:
- Specific and measurable
- Achievable in a reasonable timeframe
- Building toward the overall goal

Respond in JSON format:
{
  "milestones": [
    {
      "title": "<short milestone title>",
      "description": "<1-2 sentence description>",
      "estimatedEffort": "<time estimate, e.g., '1 week', '2 days'>"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Goal: ${goal.title}
Description: ${goal.description || 'No description provided'}
Existing Milestones: ${existingMilestones}

Please suggest new milestones that complement any existing ones.`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const result = JSON.parse(content);
    return result.milestones || [];
  } catch (error) {
    console.error("Error suggesting milestones:", error);
    return [];
  }
}

export interface GoalPatternAlert {
  type: "progress" | "stalled" | "milestone" | "at_risk";
  goalTitle: string;
  title: string;
  description: string;
  actionSuggestion?: string;
}

/**
 * Detect goal-related patterns and alerts
 * Identifies stalled goals, recent achievements, and at-risk targets
 */
export async function detectGoalPatternAlerts(
  goals: Array<{
    title: string;
    description?: string | null;
    progressPercent: number;
    status: string;
    targetDate?: Date | null;
    aiLastAnalyzed?: Date | null;
    milestones?: Array<{ title: string; isCompleted: boolean; completedAt?: string | null }>;
  }>,
  recentMemories: Array<{ memoryText: string; timestamp: Date }>
): Promise<GoalPatternAlert[]> {
  const alerts: GoalPatternAlert[] = [];
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const goal of goals) {
    if (goal.status !== 'active') continue;

    // Check for stalled goals (no analysis in 7+ days and < 80% complete)
    if (goal.aiLastAnalyzed) {
      const daysSinceAnalysis = (now.getTime() - new Date(goal.aiLastAnalyzed).getTime()) / dayMs;
      if (daysSinceAnalysis > 7 && goal.progressPercent < 80) {
        alerts.push({
          type: "stalled",
          goalTitle: goal.title,
          title: `"${goal.title}" — ${Math.floor(daysSinceAnalysis)} days no movement`,
          description: `No logged activity on this goal in ${Math.floor(daysSinceAnalysis)} days. Either it's blocked or it's been deprioritized. Either way, log something.`,
          actionSuggestion: "Pick the smallest next action and log it. Momentum compounds.",
        });
      }
    }

    // Check for at-risk targets (target date approaching with low progress)
    if (goal.targetDate) {
      const daysUntilTarget = (new Date(goal.targetDate).getTime() - now.getTime()) / dayMs;
      const expectedProgress = Math.max(0, 100 - (daysUntilTarget / 30) * 100);
      
      if (daysUntilTarget > 0 && daysUntilTarget < 14 && goal.progressPercent < expectedProgress - 20) {
        alerts.push({
          type: "at_risk",
          goalTitle: goal.title,
          title: `"${goal.title}" — ${Math.floor(daysUntilTarget)} days, ${goal.progressPercent}% done`,
          description: `Target date in ${Math.floor(daysUntilTarget)} days and you're at ${goal.progressPercent}%. The math isn't working in your favor. What's the next concrete action?`,
          actionSuggestion: "Cut or defer the lowest-value milestones and focus on what moves the needle most.",
        });
      }
    }

    // Check for recent milestone completions
    if (goal.milestones) {
      const recentlyCompleted = goal.milestones.filter(m => {
        if (!m.isCompleted || !m.completedAt) return false;
        const completedDate = new Date(m.completedAt);
        return (now.getTime() - completedDate.getTime()) / dayMs < 3;
      });
      
      if (recentlyCompleted.length > 0) {
        alerts.push({
          type: "milestone",
          goalTitle: goal.title,
          title: `Milestone shipped: "${goal.title}"`,
          description: `"${recentlyCompleted[0].title}" — done. That's how it's done. Keep the commit history clean.`,
        });
      }
    }

    // Check for good progress (approaching completion)
    if (goal.progressPercent >= 80 && goal.progressPercent < 100) {
      alerts.push({
        type: "progress",
        goalTitle: goal.title,
        title: `"${goal.title}" — ${goal.progressPercent}%, almost done`,
        description: `${goal.progressPercent}% and closing. Don't let the last 20% sit in the backlog — that's where goals go to die.`,
        actionSuggestion: "Finish it. The last sprint is the one that counts.",
      });
    }
  }

  // Limit to top 3 most relevant alerts
  return alerts.slice(0, 3);
}
