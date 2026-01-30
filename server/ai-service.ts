import OpenAI from "openai";

// Using gpt-4o-mini for fast, cost-effective AI processing
// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

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
 * AI-extracted metadata structure
 */
export interface ExtractedMetadata {
  topicTag: string;
  metadataJson: Record<string, any>;
  mood: string;
  moodScore: number;
  detectedPeople: string[];
  aiReasoning?: AIReasoning;
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

6. REASONING: For each decision, provide a brief explanation of why you made that choice. This helps users understand your logic.

Respond with JSON in this exact format: 
{
  "topicTag": "string",
  "metadataJson": { "field1": "value1", "field2": ["array", "values"], ... },
  "mood": "string (one of the mood options)",
  "moodScore": number (-100 to 100),
  "detectedPeople": ["name1", "name2", ...],
  "reasoning": {
    "topic": "Brief explanation of why this topic was chosen",
    "mood": "Brief explanation of the emotional tone detected",
    "people": "Brief explanation of people identified (or 'No specific names mentioned')"
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
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
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

    // Use different system prompts based on whether user asked a specific question
    const systemPrompt = question 
      ? `You are an expert life coach and personal analyst. The user is asking a specific question about their memories. 

FOCUS YOUR ANSWER ON THEIR QUESTION: "${question}"

Analyze the memories to directly answer their question. Your response should:
1. SUMMARY: Directly answer their specific question based on the memories
2. PATTERNS: List specific patterns or themes from the memories that relate to their question
3. RECOMMENDATIONS: Provide actionable suggestions that address their question
4. TIMESPAN: Description of the time period covered

Be specific to their question. Don't give a generic life analysis - focus on what they asked about.

Respond with JSON in this format:
{
  "summary": "A direct answer to their question based on the memories",
  "patterns": ["relevant pattern 1", "relevant pattern 2", ...],
  "recommendations": ["targeted suggestion 1", "targeted suggestion 2", ...],
  "timespan": "e.g., 'Last 30 days' or 'January - March 2024'"
}`
      : `You are an expert life coach and personal analyst. Analyze the user's memories to identify:

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
}`;

    const userPrompt = question 
      ? `Here are my memories. Please answer my question: "${question}"\n\nMemories:\n${memorySummary}`
      : `Analyze the following memories and identify patterns, themes, and insights:\n\n${memorySummary}`;

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

export async function generateMorningBriefing(
  recentMemories: Array<{ memoryText: string; mood?: string; moodScore?: number; timestamp: Date; topicTag: string; detectedPeople?: string[] }>,
  userName?: string,
  localHour?: number,
  recentEmails?: EmailContext[],
  activeProjects?: string[],
  financialSummary?: FinancialSummary,
  knownPeople?: PersonContext[],
  locationContext?: string
): Promise<MorningBriefing> {
  try {
    const hour = localHour ?? new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    
    const memorySummary = recentMemories.map((m, i) => 
      `[${m.timestamp.toISOString().split('T')[0]}] Mood: ${m.mood || 'neutral'} (${m.moodScore || 0}) | Topic: ${m.topicTag}${m.detectedPeople?.length ? ` | People: ${m.detectedPeople.join(', ')}` : ''}\n"${m.memoryText}"`
    ).join('\n\n');

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

    // Format email context if available
    let emailContext = '';
    if (recentEmails && recentEmails.length > 0) {
      emailContext = `\n\nRECENT EMAILS (last 24-48 hours):\n${recentEmails.map(e => 
        `From: ${e.from} | Subject: "${e.subject}"\nPreview: ${e.snippet}`
      ).join('\n\n')}`;
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a warm, supportive personal AI assistant generating a ${timeOfDay} briefing for the user${userName ? ` named ${userName}` : ''}. 

Based on their recent memories${recentEmails?.length ? ', emails' : ''}${financialSummary ? ', and spending data' : ''}${locationContext ? ', location patterns' : ''}${activeProjects?.length ? ', with special attention to their active focus areas' : ''}${knownPeople?.length ? ', and knowledge about people in their life' : ''}, create a personalized briefing that:
1. GREETING: A warm, personalized greeting mentioning their name if provided
2. SUMMARY: Brief overview of what's been happening in their life (2-3 sentences)
3. FOCUS_AREAS: Key things they might want to pay attention to today (based on patterns/pending items)
4. REMINDERS: Any follow-ups or things mentioned that might need attention
5. MOOD_TREND: A supportive observation about their emotional patterns
6. AFFIRMATION: An encouraging statement or positive affirmation
${recentEmails?.length ? `7. EMAIL_HIGHLIGHTS: 1-3 relevant emails that relate to people or topics from their memories (if any match). Only include emails that genuinely connect to something in their memories - don't force connections.` : ''}
${financialSummary ? `8. FINANCIAL_INSIGHTS: 1-2 brief, non-judgmental observations about spending patterns. Focus on facts and any connections to their memories/activities. Keep it supportive, not preachy.` : ''}

IMPORTANT: When people are mentioned in memories, ALWAYS check the "PEOPLE IN USER'S LIFE" section to understand their relationship to the user. Use this relationship context to make the briefing feel more personal. For example, if "Kim" is listed as "daughter", refer to her as "your daughter Kim" rather than just "Kim" or "a friend named Kim".

Be warm but not overly effusive. Be practical and helpful. Focus on actionable insights.

Respond with JSON:
{
  "greeting": "personalized greeting",
  "summary": "what's been happening",
  "focusAreas": ["area 1", "area 2", ...],
  "reminders": ["reminder 1", "reminder 2", ...],
  "moodTrend": "observation about their emotional state",
  "affirmation": "encouraging statement"${recentEmails?.length ? `,
  "emailHighlights": ["Email from X about Y relates to your project...", ...]` : ''}${financialSummary ? `,
  "financialInsights": ["You spent $X on Y this week...", ...]` : ''}
}`
        },
        {
          role: "user",
          content: recentMemories.length > 0 
            ? `Here are my recent memories from the past week:\n\n${memorySummary}${peopleContext}${activeProjectsContext}${emailContext}${financialContext}${locationCtx}\n\nGenerate my ${timeOfDay} briefing.`
            : `I don't have any recent memories logged.${peopleContext}${activeProjectsContext}${emailContext}${financialContext}${locationCtx}\n\nGenerate a welcoming ${timeOfDay} briefing encouraging me to start logging.`
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
          content: `You are a helpful financial assistant answering questions about a user's spending and accounts.
Be conversational, supportive, and non-judgmental. Focus on facts and patterns.
Keep answers concise (2-4 sentences) unless more detail is needed.

Available data:
- Transactions from the last 30 days
- Connected account balances

If asked about something not in the data, acknowledge that and explain what you can see.`
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
  }>,
  upcomingEvents?: CalendarContext[],
  recentEmails?: EmailContext[],
  financialSummary?: FinancialSummary,
  userName?: string,
  userTimezone: string = 'UTC',
  knownPeople?: PersonContext[],
  locationContext?: string
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

    const memorySummary = recentMemories.map((m, i) => 
      `[${m.timestamp.toISOString().split('T')[0]}] Mood: ${m.mood || 'neutral'} (${m.moodScore || 0}) | Topic: ${m.topicTag}${m.detectedPeople?.length ? ` | People: ${m.detectedPeople.join(', ')}` : ''}\n"${m.memoryText}"`
    ).join('\n\n');

    // Get current date/time in user's timezone for accurate "today/tomorrow" references
    const nowInUserTz = new Date().toLocaleString('en-US', { timeZone: userTimezone });
    const userLocalDate = new Date(nowInUserTz);
    const todayStr = formatDateInTimezone(new Date(), userTimezone);
    
    let calendarContext = '';
    if (upcomingEvents && upcomingEvents.length > 0) {
      calendarContext = `\n\nTODAY'S DATE (user's local time): ${todayStr}\n\nUPCOMING CALENDAR EVENTS:\n${upcomingEvents.map(e => {
        const eventDate = formatDateInTimezone(new Date(e.startTime), userTimezone);
        const isToday = eventDate === todayStr;
        const dayLabel = isToday ? '(TODAY)' : '';
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a personal news editor creating a "Local News" feed about a user's life${userName ? ` (${userName})` : ''}. 
          
The user's timezone is ${userTimezone}. All times shown in the data are already converted to their local timezone.

Think of this as a personalized newspaper about their ecosystem - their memories, calendars, emails, and finances are your "news sources."

Generate 4-8 news-style stories from the data provided. Each story should read like a brief news article about their life:

STORY CATEGORIES:
- people: Stories about relationships, interactions with specific people mentioned in memories
- projects: Updates on ongoing work, hobbies, or activities they're tracking
- calendar: Upcoming events, meetings, or things to prepare for
- financial: Spending patterns, notable purchases, budget observations
- wellbeing: Mood trends, self-care patterns, health-related observations
- highlights: Notable achievements, milestones, or positive moments
- location: Location-based observations (places visited, routine patterns, travel activity)

STORY PRIORITIES:
- breaking: Time-sensitive or very important (upcoming event today, urgent email)
- featured: Significant patterns or notable events (mood improvements, project milestones)
- standard: Regular updates and observations

STORY SENTIMENTS:
- positive: Good news, achievements, improvements
- neutral: Informational updates, reminders
- negative: Concerns that need attention (but frame constructively)
- celebratory: Milestones, achievements worth celebrating

WRITING STYLE:
- Write headlines like a newspaper: concise, engaging, present tense
- Summaries should be 1-2 sentences, informative but warm
- Details can expand on the story with specific examples
- Reference actual names, dates, and specifics from the data
- Be supportive and positive, never judgmental

Example stories:
- Headline: "Catch-Up with Sarah Scheduled for Tomorrow"
  Summary: "Your coffee meeting with Sarah is tomorrow at 10 AM at Blue Bottle. You last mentioned her 3 days ago in a positive context."
  
- Headline: "Weekend Productivity Streak Continues"
  Summary: "Your mood scores have improved 20% since Monday, with most positive memories centered around project work."

IMPORTANT: When people are mentioned, ALWAYS check the "PEOPLE IN USER'S LIFE" section to understand their relationship. Use this to make stories more personal. For example, if "Kim" is listed as "daughter", your headline should say "Daughter Kim" or refer to "your daughter Kim" rather than just "Kim" or "friend Kim".

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
          content: `Generate my personal news feed based on this data from my Keryx ecosystem:\n\nRECENT MEMORIES (last 7 days):\n${memorySummary || 'No recent memories.'}${peopleContext}${calendarContext}${emailContext}${financialContext}${locationCtx}\n\nCreate news stories that synthesize insights across these data sources.`
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
