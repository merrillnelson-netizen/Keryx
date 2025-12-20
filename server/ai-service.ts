import OpenAI from "openai";

// Using gpt-4o-mini for fast, cost-effective AI processing
// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

/**
 * AI-extracted metadata structure
 */
export interface ExtractedMetadata {
  topicTag: string;
  metadataJson: Record<string, any>;
  mood: string;
  moodScore: number;
  detectedPeople: string[];
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
 * Topic-specific metadata schemas for extraction
 * These guide the AI on what fields to extract for each topic
 */
const TOPIC_SCHEMAS = {
  Billiards: ["round", "table", "game", "breaker", "racker", "winner"],
  Groceries: ["store", "items_list", "budget"],
  Meeting: ["attendees", "action_items", "meeting_topic"],
  General: [], // No specific fields
};

/**
 * Extract metadata from raw memory text using AI
 * Identifies topic and extracts structured data
 * 
 * @param memoryText - Raw voice-to-text transcription
 * @returns Promise<ExtractedMetadata> - Topic tag and structured metadata
 */
export async function extractMetadata(memoryText: string): Promise<ExtractedMetadata> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a metadata extraction expert with emotional intelligence. Analyze the text and extract:

1. TOPIC: Identify the single most relevant topic tag from: Billiards, Groceries, Meeting, General (default to General if unclear)

2. ENTITIES: Extract specific entities based on the topic:
   - Billiards: round, table, game, breaker, racker, winner
   - Groceries: store, items_list (as array), budget
   - Meeting: attendees (as array), action_items (as array), meeting_topic
   - General: any relevant structured data you can extract
   
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

Respond with JSON in this exact format: 
{
  "topicTag": "string",
  "metadataJson": { "field1": "value1", "field2": ["array", "values"], ... },
  "mood": "string (one of the mood options)",
  "moodScore": number (-100 to 100),
  "detectedPeople": ["name1", "name2", ...]
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
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate and normalize the result
    return {
      topicTag: result.topicTag || "General",
      metadataJson: result.metadataJson || {},
      mood: result.mood || "neutral",
      moodScore: typeof result.moodScore === 'number' ? Math.max(-100, Math.min(100, result.moodScore)) : 0,
      detectedPeople: Array.isArray(result.detectedPeople) ? result.detectedPeople : [],
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
    console.error("Error generating embedding:", error);
    console.warn("Falling back to zero vector for embedding");
    // Return a zero vector of correct dimensions (1536) as fallback
    // This allows memories to be saved even if OpenAI is unavailable
    // Semantic search won't work for these entries, but basic filtering will
    return new Array(1536).fill(0);
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
   - topicTag: Topic if mentioned (Billiards, Groceries, Meeting, General)
   - timestampFilter: Date/time constraints (convert relative dates like "this morning", "today", "last Tuesday" to actual dates)
     - start: ISO date string
     - end: ISO date string
   - metadataFilters: Specific field values using EXACT field names from common patterns:
     
     For food/meal queries use these EXACT field names:
     - meal_type: "breakfast" | "lunch" | "dinner" | "snack"
     - restaurant: name of restaurant
     - beverage: drink name
     - beverage_type: "soda" | "coffee" | "tea" | "juice" etc.
     
     For Billiards queries:
     - round, table, game, breaker, racker, winner
     
     For Groceries queries:
     - store, items_list, budget
     
     For Meeting queries:
     - attendees, action_items, meeting_topic

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

Current date for reference: ${new Date().toISOString()}`,
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
    const timestampFilter: any = {};
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
  memories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string }>,
  question?: string
): Promise<ThematicInsight> {
  try {
    // Prepare memory summary for context
    const memorySummary = memories.map((m, i) => 
      `[${i + 1}] ${m.timestamp.toISOString().split('T')[0]} | Mood: ${m.mood || 'unknown'} (${m.moodScore || 0}) | Topic: ${m.topicTag}\n"${m.memoryText}"`
    ).join('\n\n');

    const prompt = question 
      ? `Based on the following memories, answer this question: "${question}"\n\nMemories:\n${memorySummary}`
      : `Analyze the following memories and identify patterns, themes, and insights:\n\n${memorySummary}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert life coach and personal analyst. Analyze the user's memories to identify:

1. SUMMARY: A concise overview of what these memories reveal about the user's life/work during this period
2. PATTERNS: Recurring themes, behaviors, emotional patterns, or concerns
3. RECOMMENDATIONS: Actionable suggestions based on the patterns observed
4. TIMESPAN: Description of the time period covered

Be insightful but compassionate. Focus on constructive observations.

Respond with JSON in this format:
{
  "summary": "A 2-3 sentence overview",
  "patterns": ["pattern 1", "pattern 2", ...],
  "recommendations": ["suggestion 1", "suggestion 2", ...],
  "timespan": "e.g., 'Last 30 days' or 'January - March 2024'"
}`,
        },
        {
          role: "user",
          content: prompt,
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
 * Morning briefing result
 */
export interface MorningBriefing {
  greeting: string;
  summary: string;
  focusAreas: string[];
  reminders: string[];
  moodTrend: string;
  affirmation: string;
}

/**
 * Generate a personalized morning briefing based on recent memories
 * Provides context-aware daily summary with reminders and insights
 * 
 * @param recentMemories - Last 7 days of memories
 * @param todayMemories - Memories from today (if any)
 * @param moodStats - Recent mood statistics
 * @returns Promise<MorningBriefing>
 */
export async function generateMorningBriefing(
  recentMemories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string; detectedPeople?: string[] }>,
  userName?: string,
  localHour?: number
): Promise<MorningBriefing> {
  try {
    const hour = localHour ?? new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    
    const memorySummary = recentMemories.map((m, i) => 
      `[${m.timestamp.toISOString().split('T')[0]}] Mood: ${m.mood || 'neutral'} (${m.moodScore || 0}) | Topic: ${m.topicTag}${m.detectedPeople?.length ? ` | People: ${m.detectedPeople.join(', ')}` : ''}\n"${m.memoryText}"`
    ).join('\n\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a warm, supportive personal AI assistant generating a ${timeOfDay} briefing for the user${userName ? ` named ${userName}` : ''}. 

Based on their recent memories, create a personalized briefing that:
1. GREETING: A warm, personalized greeting mentioning their name if provided
2. SUMMARY: Brief overview of what's been happening in their life (2-3 sentences)
3. FOCUS_AREAS: Key things they might want to pay attention to today (based on patterns/pending items)
4. REMINDERS: Any follow-ups or things mentioned that might need attention
5. MOOD_TREND: A supportive observation about their emotional patterns
6. AFFIRMATION: An encouraging statement or positive affirmation

Be warm but not overly effusive. Be practical and helpful. Focus on actionable insights.

Respond with JSON:
{
  "greeting": "personalized greeting",
  "summary": "what's been happening",
  "focusAreas": ["area 1", "area 2", ...],
  "reminders": ["reminder 1", "reminder 2", ...],
  "moodTrend": "observation about their emotional state",
  "affirmation": "encouraging statement"
}`
        },
        {
          role: "user",
          content: recentMemories.length > 0 
            ? `Here are my recent memories from the past week:\n\n${memorySummary}\n\nGenerate my ${timeOfDay} briefing.`
            : `I don't have any recent memories logged. Generate a welcoming ${timeOfDay} briefing encouraging me to start logging.`
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
    };
  } catch (error) {
    console.error("Error generating morning briefing:", error);
    return {
      greeting: "Good day!",
      summary: "Unable to generate briefing at this time.",
      focusAreas: [],
      reminders: [],
      moodTrend: "Keep tracking your memories!",
      affirmation: "You're doing great!",
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
  memories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string }>
): Promise<PatternAlert[]> {
  try {
    if (memories.length < 5) {
      return []; // Need sufficient data for pattern detection
    }

    const memorySummary = memories.map((m) => 
      `[${m.timestamp.toISOString().split('T')[0]}] ${m.mood || 'neutral'} (${m.moodScore || 0}) | ${m.topicTag}: "${m.memoryText}"`
    ).join('\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI pattern detector analyzing user memories for significant patterns worth alerting about.

Identify 0-3 notable patterns that the user should know about:
- POSITIVE: Good habits, improving trends, achievements
- NEGATIVE: Concerning patterns, declining moods, stress indicators  
- NEUTRAL: Interesting observations without strong valence
- INSIGHT: Connections or realizations that might help

For each pattern, provide:
- type: "positive" | "negative" | "neutral" | "insight"
- title: Brief label (5-8 words max)
- description: 1-2 sentence explanation
- actionSuggestion: Optional recommendation

Only report genuinely significant patterns. Empty array is fine if nothing notable.

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
  currentDate: Date = new Date()
): Promise<DetectedCalendarEvent> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that detects future events from natural language.
Analyze the text to determine if it describes a FUTURE calendar event (meeting, appointment, gathering, call, etc.).

Current date/time context: ${currentDate.toISOString()}

RULES:
1. Only detect FUTURE events (not past events or general statements)
2. If dates are relative ("tomorrow", "next Tuesday", "in 2 weeks"), calculate the actual date
3. If no specific time is mentioned, use reasonable defaults:
   - Morning meetings: 9:00 AM
   - Lunch: 12:00 PM  
   - Afternoon: 2:00 PM
   - Dinner: 7:00 PM
   - Default duration: 1 hour
4. Extract all attendee names mentioned
5. Extract location if mentioned

Respond with JSON:
{
  "detected": true/false,
  "title": "Event title based on context",
  "startDateTime": "ISO 8601 datetime string",
  "endDateTime": "ISO 8601 datetime string", 
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
