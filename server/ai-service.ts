import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      model: "gpt-5",
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
      model: "gpt-5",
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
