import OpenAI from "openai";
import { tavily } from "@tavily/core";
import { buildTemporalContext } from "./temporal-context";

const openai = new OpenAI({ 
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  // Only set baseURL when using Replit AI Integration
  ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
  timeout: 30000,
  maxRetries: 2,
});

// Minimum relevance score to show a discovery (0-1 scale)
// Tavily "basic" search_depth returns scores in the 0.3–0.7 range for lifestyle/goal queries
const MIN_RELEVANCE_THRESHOLD = 0.3;

// Time windows for different trigger types
const TRIP_WINDOW_DAYS = 7; // Only show trip content when within 7 days
const MEMORY_WINDOW_DAYS = 7; // Only consider memories from last 7 days
const LARGE_TRANSACTION_THRESHOLD = 100; // Transactions above this are "notable"

export interface Discovery {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  insightContext: string;
  category: 'travel' | 'shopping' | 'local' | 'professional' | 'lifestyle' | 'financial' | 'general';
  relevanceScore: number;
  urgency: 'immediate' | 'upcoming' | 'general';
}

export interface InsightContext {
  type: 'calendar' | 'email' | 'memory' | 'financial' | 'location' | 'goal';
  summary: string;
  location?: string;
  date?: string;
  topics: string[];
  urgency: 'immediate' | 'upcoming' | 'general';
  confidence: number; // 0-1 score for how relevant this insight is
  homeCity?: string; // For localizing memory-based searches when no explicit location in topic
}

export interface DiscoveriesResponse {
  discoveries: Discovery[];
  insights: InsightContext[];
  generatedAt: string;
  error?: string;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilySearchResponse {
  query: string;
  results: TavilyResult[];
  answer?: string;
}

interface ExtendedMemory {
  memoryText: string;
  topicTag?: string;
  detectedPeople?: string[];
  locationName?: string;
  timestamp?: Date | string;
}

interface ExtendedCalendarEvent {
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
}

interface ExtendedFinancialData {
  merchants?: string[];
  categories?: string[];
  merchantAggregates?: Array<{ name: string; amount: number; date?: string; category?: string }>;
}

interface CurrentLocationContext {
  currentCity?: string;
  homeCity?: string;
  isAway?: boolean;
}

interface ExtendedGoal {
  title: string;
  description?: string | null;
  progressPercent: number;
  status: string;
}

export async function extractSearchableInsights(
  memories: ExtendedMemory[],
  calendarEvents: ExtendedCalendarEvent[],
  emails: Array<{ subject?: string; snippet?: string; from?: string }>,
  financialData?: ExtendedFinancialData,
  locationContext?: CurrentLocationContext,
  activeGoals?: ExtendedGoal[],
  userTimezone: string = 'America/Denver'
): Promise<InsightContext[]> {
  const insights: InsightContext[] = [];
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + TRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - MEMORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // 1. LOCATION AWARENESS: If user is visiting a new location, show local discoveries
  if (locationContext?.isAway && locationContext.currentCity) {
    const cityName = locationContext.currentCity.split(',')[0].trim();
    const { year: currentYear, month: currentMonth } = buildTemporalContext(userTimezone);
    
    insights.push({
      type: 'location',
      summary: `Currently visiting ${cityName}`,
      location: locationContext.currentCity,
      topics: [
        `${cityName} events ${currentMonth} ${currentYear}`,
        `best places to eat ${cityName} local favorites`,
        `${cityName} hidden gems locals recommend`
      ],
      urgency: 'immediate',
      confidence: 0.95
    });
  }

  // 2. IMMINENT TRAVEL: Only calendar events with locations within 7 days
  const imminentTrips = calendarEvents
    .filter(e => {
      if (!e.location) return false;
      const eventDate = e.start?.dateTime || e.start?.date;
      if (!eventDate) return false;
      const eventDateTime = new Date(eventDate);
      // Must be in the future but within 7 days
      return eventDateTime > now && eventDateTime <= sevenDaysFromNow;
    })
    .slice(0, 2);

  for (const event of imminentTrips) {
    const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    insights.push({
      type: 'calendar',
      summary: `${event.summary || 'Trip'} in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
      location: event.location,
      date: event.start?.dateTime || event.start?.date,
      topics: generateLocationSpecificTopics(event.location || '', daysUntil),
      urgency: daysUntil <= 2 ? 'immediate' : 'upcoming',
      confidence: 0.9
    });
  }

  // 3. RECENT ACTIONABLE MEMORIES: Look for specific interests/needs from last 7 days
  const recentMemories = memories.filter(m => {
    if (!m.timestamp) return false; // Exclude if no timestamp (could be old)
    const memoryDate = new Date(m.timestamp);
    return memoryDate >= sevenDaysAgo;
  });

  // Derive the effective search location:
  // - If traveling: use current city (most relevant)
  // - If at home: use home city (so food/local searches are localized, not global)
  const effectiveLocation =
    (locationContext?.isAway && locationContext.currentCity)
      ? locationContext.currentCity.split(',')[0].trim()
      : locationContext?.homeCity
        ? locationContext.homeCity.split(',')[0].trim()
        : undefined;

  // Only extract insights if there are recent memories with actionable content
  const hasOpenAIKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (recentMemories.length > 0 && hasOpenAIKey) {
    const memoryInsights = await extractActionableMemoryInsights(recentMemories, effectiveLocation);
    // Carry homeCity on each insight so buildPersonalizedSearchQueries can use it as a fallback
    const taggedInsights = memoryInsights.map(i => ({ ...i, homeCity: effectiveLocation }));
    insights.push(...taggedInsights);
  }

  // 4. NOTABLE FINANCIAL TRIGGERS: Only large merchant aggregates (30-day totals, not individual purchases)
  if (financialData?.merchantAggregates && financialData.merchantAggregates.length > 0) {
    const notableTransactions = financialData.merchantAggregates
      .filter(t => Math.abs(t.amount) >= LARGE_TRANSACTION_THRESHOLD)
      .slice(0, 3);

    for (const tx of notableTransactions) {
      const insight = generateFinancialInsight(tx);
      if (insight) {
        insights.push(insight);
      }
    }
  }

  // 5. ACTIVE GOALS: Generate relevant search topics for user's goals
  if (activeGoals && activeGoals.length > 0) {
    const activeGoalsList = activeGoals.filter(g => g.status === 'active').slice(0, 2);
    
    for (const goal of activeGoalsList) {
      const goalTopics = generateGoalTopics(goal.title, goal.description || '', userTimezone);
      if (goalTopics.length > 0) {
        insights.push({
          type: 'goal',
          summary: `Working toward: ${goal.title} (${goal.progressPercent}% complete)`,
          topics: goalTopics,
          urgency: goal.progressPercent < 25 ? 'immediate' : 'general',
          confidence: 0.75
        });
      }
    }
  }

  // Filter insights by confidence and sort by urgency
  return insights
    .filter(i => i.confidence >= 0.7)
    .sort((a, b) => {
      const urgencyOrder = { immediate: 0, upcoming: 1, general: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    })
    .slice(0, 4); // Max 4 high-quality insights
}

function generateLocationSpecificTopics(location: string, daysUntil: number): string[] {
  // Extract city name from location string
  const cityMatch = location.match(/([A-Za-z\s]+),?\s*([A-Z]{2})?/);
  const city = cityMatch ? cityMatch[1].trim() : location;

  if (daysUntil <= 2) {
    // Immediate: focus on what to do NOW
    return [`${city} events this weekend`, `${city} best restaurants`, `${city} weather forecast`];
  } else {
    // Upcoming: focus on planning
    return [`${city} hidden gems`, `${city} local recommendations`, `${city} must-see attractions`];
  }
}

function generateGoalTopics(title: string, description: string, userTimezone: string = 'America/Denver'): string[] {
  // Generate search topics based on goal title and description
  const combined = `${title} ${description}`.toLowerCase();
  const topics: string[] = [];
  const { year: currentYear } = buildTemporalContext(userTimezone);
  
  // Add a specific search based on the goal
  topics.push(`how to ${title.toLowerCase()} tips ${currentYear}`);
  
  // Add related searches based on common goal keywords
  if (combined.includes('learn') || combined.includes('study')) {
    topics.push(`best resources to learn ${title.toLowerCase()}`);
  } else if (combined.includes('weight') || combined.includes('fitness') || combined.includes('health')) {
    topics.push(`effective strategies for ${title.toLowerCase()}`);
  } else if (combined.includes('save') || combined.includes('money') || combined.includes('financial')) {
    topics.push(`${title.toLowerCase()} strategies that work`);
  } else if (combined.includes('career') || combined.includes('job') || combined.includes('work')) {
    topics.push(`${title.toLowerCase()} career advice ${currentYear}`);
  } else {
    topics.push(`${title.toLowerCase()} success tips`);
  }
  
  return topics.slice(0, 2); // Max 2 topics per goal
}

async function extractActionableMemoryInsights(memories: ExtendedMemory[], effectiveLocation?: string): Promise<InsightContext[]> {
  try {
    const memoryTexts = memories.slice(0, 10).map(m => m.memoryText).join('\n');

    const locationRule = effectiveLocation
      ? `\nLOCATION RULE: The user is based in ${effectiveLocation}. If and ONLY IF they expressed a desire to FIND a local place (restaurant, shop, service, etc.), include "${effectiveLocation}" in the search query — e.g. "best Egg Foo Young restaurants ${effectiveLocation}". Do NOT add a city to non-local queries (e.g. camera research, car troubleshooting).`
      : '';
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze these recent personal memories and extract ONLY insights where the person would genuinely benefit from a web search RIGHT NOW.

STRICT CRITERIA - Only extract if:
1. There's a SPECIFIC need (not vague interest)
2. The need is TIME-SENSITIVE or ACTION-ORIENTED
3. Web content would provide PRACTICAL value

Good examples:
- "considering buying a new camera for travel" → "mirrorless cameras for travel photography 2024"
- "my car is making a strange noise" → "car grinding noise when braking causes"
- "starting to learn guitar" → "beginner guitar practice routine"
- "want to find a good dim sum place" → "best dim sum restaurants [city]"

Do NOT extract for:
- General musings or reflections
- Past events with no future action
- Food or drink the person simply ATE or DRANK ("had Egg Foo Young for dinner", "ate sushi last night") — they already consumed it; no search needed
- Vague interests without clear need
- Things the person already did or resolved${locationRule}

Return JSON:
{
  "insights": [
    {
      "summary": "Specific need in user's words",
      "topics": ["highly specific search query 1", "highly specific search query 2"],
      "confidence": 0.0-1.0,
      "reasoning": "Why this matters now"
    }
  ]
}

If nothing meets the criteria, return {"insights": []}`
        },
        {
          role: "user",
          content: `Recent memories (last 7 days):\n${memoryTexts}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const extracted = JSON.parse(response.choices[0].message.content || '{}');
    
    if (extracted.insights && Array.isArray(extracted.insights)) {
      return extracted.insights
        .filter((i: any) => i.confidence >= 0.7)
        .slice(0, 2)
        .map((i: any) => ({
          type: 'memory' as const,
          summary: i.summary,
          topics: i.topics || [],
          urgency: 'general' as const,
          confidence: i.confidence || 0.7
        }));
    }
  } catch (error) {
    console.error('Failed to extract memory insights:', error);
  }
  
  return [];
}

function generateFinancialInsight(transaction: { name: string; amount: number; date?: string; category?: string }): InsightContext | null {
  const amount = Math.abs(transaction.amount);
  const merchant = transaction.name.toLowerCase();
  
  // Only generate insights for specific merchant categories above the threshold
  // Note: amounts here are 30-day aggregate totals across multiple purchases, not single transactions
  const insightPatterns: Array<{ pattern: RegExp; topics: (merchant: string) => string[]; summary: (merchant: string, amount: number) => string }> = [
    {
      pattern: /amazon|best buy|target|walmart/i,
      topics: (m) => [`${m} shopping tips`, 'return policy tips'],
      summary: (m, a) => `Total at ${m}: $${a.toFixed(0)} (past 30 days)`
    },
    {
      pattern: /airline|delta|united|american|southwest|flight/i,
      topics: () => ['flight tips and travel hacks', 'airline seat selection tips'],
      summary: (m, a) => `Total flight spending: $${a.toFixed(0)} (past 30 days)`
    },
    {
      pattern: /hotel|marriott|hilton|hyatt|airbnb|vrbo/i,
      topics: () => ['hotel check-in tips', 'packing checklist'],
      summary: (m, a) => `Total accommodation: $${a.toFixed(0)} (past 30 days)`
    },
    {
      pattern: /apple|microsoft|software|subscription/i,
      topics: (m) => [`${m} tips and tricks`, 'managing software subscriptions'],
      summary: (m, a) => `Total at ${m}: $${a.toFixed(0)} (past 30 days)`
    },
  ];

  for (const pattern of insightPatterns) {
    if (pattern.pattern.test(merchant) && amount >= LARGE_TRANSACTION_THRESHOLD) {
      return {
        type: 'financial',
        summary: pattern.summary(transaction.name, amount),
        topics: pattern.topics(transaction.name),
        urgency: 'general',
        confidence: 0.75
      };
    }
  }

  return null;
}

export async function searchForDiscoveries(
  insights: InsightContext[],
  tavilyApiKey?: string,
  userTimezone: string = 'America/Denver'
): Promise<{ discoveries: Discovery[]; error?: string }> {
  if (!tavilyApiKey) {
    return { discoveries: [], error: 'No Tavily API key configured. Add TAVILY_API_KEY in settings.' };
  }
  
  // If no high-quality insights, return empty (this is intentional - no filler)
  if (insights.length === 0) {
    return { discoveries: [] };
  }
  
  const tvly = tavily({ apiKey: tavilyApiKey });
  const discoveries: Discovery[] = [];
  const seenUrls = new Set<string>();
  
  for (const insight of insights.slice(0, 3)) {
    // Build highly specific search queries
    const searchQueries = buildPersonalizedSearchQueries(insight, userTimezone);
    
    for (const searchQuery of searchQueries.slice(0, 2)) {
      try {
        const response = await tvly.search(searchQuery, {
          max_results: 2,
          search_depth: "basic",
          include_answer: false,
        }) as TavilySearchResponse;
        
        if (response.results && response.results.length > 0) {
          for (const result of response.results) {
            if (seenUrls.has(result.url)) continue;
            
            // Apply minimum relevance threshold
            // Use ?? (nullish coalescing) so a score of 0 is handled correctly,
            // and results without an explicit score are assumed relevant (0.7)
            const score = result.score ?? 0.7;
            if (score < MIN_RELEVANCE_THRESHOLD) continue;
            
            seenUrls.add(result.url);
            
            discoveries.push({
              id: `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: result.title,
              content: result.content?.slice(0, 300) || '',
              url: result.url,
              source: extractDomain(result.url),
              insightContext: insight.summary,
              category: categorizeDiscovery(insight, result),
              relevanceScore: score,
              urgency: insight.urgency,
            });
          }
        }
      } catch (error) {
        console.error(`Tavily search failed for "${searchQuery}":`, error);
      }
    }
  }
  
  // Sort by urgency first, then relevance
  const sortedDiscoveries = discoveries.sort((a, b) => {
    const urgencyOrder = { immediate: 0, upcoming: 1, general: 2 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.relevanceScore - a.relevanceScore;
  });
  
  // Deduplicate and limit
  const uniqueDiscoveries = deduplicateDiscoveries(sortedDiscoveries);
  
  return { discoveries: uniqueDiscoveries.slice(0, 6) };
}

/**
 * True if the topic sounds like a local food/restaurant/service search that
 * benefits from having a city appended.
 */
function isLocalServiceTopic(topic: string): boolean {
  return /restaurant|dining|eat|food|cafe|coffee\s+shop|bar|pub|pizza|sushi|taco|burger|brunch|breakfast|lunch|dinner|takeout|delivery|bakery|deli|brewery|winery|dim\s*sum|chinese\s+food|ramen|bbq|steak|seafood|thai|indian|mexican/i.test(topic);
}

/**
 * True if the topic already contains a location qualifier so we don't double-append.
 * Case-insensitive to catch both "in Denver" and "in denver".
 */
function topicHasLocation(topic: string): boolean {
  // Patterns: "near Denver", "in Denver/denver", "Denver CO", "Denver, CO"
  return /\bnear\s+\w|\bin\s+[a-z]|\b[A-Z][a-z]+,?\s+[A-Z]{2}\b/i.test(topic);
}

function buildPersonalizedSearchQueries(insight: InsightContext, userTimezone: string = 'America/Denver'): string[] {
  const queries: string[] = [];
  const { year: currentYear } = buildTemporalContext(userTimezone);
  
  if (insight.type === 'location' && insight.location) {
    // Currently visiting - focus on immediate local info
    queries.push(`${insight.location} things to do this week`);
    queries.push(`${insight.location} best local restaurants`);
  } else if (insight.type === 'calendar' && insight.location) {
    // Upcoming trip - use specific topics
    for (const topic of insight.topics) {
      queries.push(topic);
    }
  } else if (insight.type === 'memory') {
    // Memory-based - use the specific topics from AI extraction
    for (const topic of insight.topics) {
      // Safety net: if the topic looks like a local food/service search but has no
      // location qualifier, and we know the user's home city, append it.
      // (The AI prompt already tries to do this, but this catches any slippage.)
      if (insight.homeCity && isLocalServiceTopic(topic) && !topicHasLocation(topic)) {
        queries.push(`${topic} ${insight.homeCity} ${currentYear}`);
      } else {
        queries.push(`${topic} ${currentYear}`);
      }
    }
  } else if (insight.type === 'financial') {
    // Financial - use specific topics
    for (const topic of insight.topics) {
      queries.push(topic);
    }
  } else {
    // Fallback: use topics directly
    queries.push(...insight.topics);
  }
  
  return queries.filter(q => q.length > 5);
}

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

function categorizeDiscovery(insight: InsightContext, result: TavilyResult): Discovery['category'] {
  const text = `${result.title} ${result.content || ''}`.toLowerCase();
  
  // Use insight type as primary categorization
  if (insight.type === 'location') return 'local';
  if (insight.type === 'calendar' && insight.location) {
    if (/restaurant|food|eat|dining/i.test(text)) return 'local';
    return 'travel';
  }
  if (insight.type === 'financial') return 'financial';
  
  // Secondary: content-based categorization
  if (/sale|deal|discount|buy|shop|price|review/i.test(text)) return 'shopping';
  if (/career|job|industry|business|professional/i.test(text)) return 'professional';
  if (/health|fitness|wellness|recipe|lifestyle/i.test(text)) return 'lifestyle';
  if (/money|finance|invest|budget|save/i.test(text)) return 'financial';
  
  return 'general';
}

function normalizeText(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'your', 'you', 'best', 'top']);
  return text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function calculateSimilarity(words1: string[], words2: string[]): number {
  if (words1.length === 0 || words2.length === 0) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = Array.from(set1).filter(w => set2.has(w)).length;
  const union = new Set(words1.concat(words2)).size;
  return union > 0 ? intersection / union : 0;
}

function deduplicateDiscoveries(discoveries: Discovery[]): Discovery[] {
  const unique: Discovery[] = [];
  
  for (const discovery of discoveries) {
    const titleWords = normalizeText(discovery.title);
    const contentWords = normalizeText(discovery.content).slice(0, 30);
    const combinedWords = [...titleWords, ...contentWords];
    
    let isDuplicate = false;
    
    for (const existing of unique) {
      const existingTitleWords = normalizeText(existing.title);
      const existingContentWords = normalizeText(existing.content).slice(0, 30);
      const existingCombined = [...existingTitleWords, ...existingContentWords];
      
      const titleSimilarity = calculateSimilarity(titleWords, existingTitleWords);
      const contentSimilarity = calculateSimilarity(contentWords, existingContentWords);
      const combinedSimilarity = calculateSimilarity(combinedWords, existingCombined);
      
      const sameDomain = existing.source === discovery.source;
      const sameContext = existing.insightContext === discovery.insightContext;
      
      if (
        titleSimilarity > 0.5 ||
        contentSimilarity > 0.6 ||
        combinedSimilarity > 0.45 ||
        (sameDomain && sameContext && titleSimilarity > 0.3)
      ) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      unique.push(discovery);
    }
  }
  
  return unique;
}

export async function getContextualDiscoveries(
  memories: ExtendedMemory[],
  calendarEvents: ExtendedCalendarEvent[],
  emails: Array<{ subject?: string; snippet?: string; from?: string }>,
  financialData?: ExtendedFinancialData,
  tavilyApiKey?: string,
  locationContext?: CurrentLocationContext,
  activeGoals?: ExtendedGoal[],
  userTimezone: string = 'America/Denver'
): Promise<DiscoveriesResponse> {
  const insights = await extractSearchableInsights(memories, calendarEvents, emails, financialData, locationContext, activeGoals, userTimezone);
  
  // If no high-quality insights, return empty response (intentional - no filler content)
  if (insights.length === 0) {
    return {
      discoveries: [],
      insights: [],
      generatedAt: new Date().toISOString(),
    };
  }
  
  const result = await searchForDiscoveries(insights, tavilyApiKey, userTimezone);
  
  return {
    discoveries: result.discoveries,
    insights,
    generatedAt: new Date().toISOString(),
    error: result.error,
  };
}
