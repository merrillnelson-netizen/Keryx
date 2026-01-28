import OpenAI from "openai";
import { tavily } from "@tavily/core";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

export interface Discovery {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  insightContext: string;
  category: 'travel' | 'shopping' | 'local' | 'professional' | 'lifestyle' | 'financial' | 'general';
  relevanceScore: number;
}

export interface InsightContext {
  type: 'calendar' | 'email' | 'memory' | 'financial';
  summary: string;
  location?: string;
  date?: string;
  topics: string[];
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

export async function extractSearchableInsights(
  memories: Array<{ memoryText: string; topicTag?: string; detectedPeople?: string[]; locationName?: string }>,
  calendarEvents: Array<{ summary?: string; location?: string; start?: { dateTime?: string; date?: string } }>,
  emails: Array<{ subject?: string; snippet?: string; from?: string }>,
  financialData?: { merchants?: string[]; categories?: string[]; recentTransactions?: Array<{ name: string; amount: number }> }
): Promise<InsightContext[]> {
  const insights: InsightContext[] = [];
  
  // Extract travel-related calendar events (future events with locations)
  const now = new Date();
  const travelEvents = calendarEvents
    .filter(e => {
      if (!e.location) return false;
      const eventDate = e.start?.dateTime || e.start?.date;
      if (!eventDate) return false;
      return new Date(eventDate) > now;
    })
    .slice(0, 3);
  
  for (const event of travelEvents) {
    insights.push({
      type: 'calendar',
      summary: event.summary || 'Upcoming trip',
      location: event.location,
      date: event.start?.dateTime || event.start?.date,
      topics: ['travel', 'local news', 'weather', 'events']
    });
  }
  
  // Extract travel-related emails
  const travelKeywords = ['flight', 'hotel', 'reservation', 'booking', 'itinerary', 'vacation', 'trip', 'travel', 'airbnb', 'airline'];
  const travelEmails = emails
    .filter(e => {
      const text = `${e.subject || ''} ${e.snippet || ''}`.toLowerCase();
      return travelKeywords.some(k => text.includes(k));
    })
    .slice(0, 2);
  
  for (const email of travelEmails) {
    insights.push({
      type: 'email',
      summary: email.subject || 'Travel-related email',
      topics: ['travel tips', 'packing', 'travel gear']
    });
  }
  
  // Extract project-related memories
  const projectMemories = memories
    .filter(m => m.topicTag && ['work', 'project', 'meeting', 'career'].includes(m.topicTag.toLowerCase()))
    .slice(0, 3);
  
  for (const memory of projectMemories) {
    insights.push({
      type: 'memory',
      summary: memory.memoryText.slice(0, 100),
      location: memory.locationName,
      topics: [memory.topicTag || 'professional development']
    });
  }
  
  // Extract shopping/financial insights
  if (financialData?.recentTransactions && financialData.recentTransactions.length > 0) {
    const categories = financialData.categories || [];
    const shoppingCategories = categories.filter(c => 
      ['shopping', 'retail', 'electronics', 'clothing', 'home improvement'].some(k => c.toLowerCase().includes(k))
    );
    
    if (shoppingCategories.length > 0) {
      insights.push({
        type: 'financial',
        summary: `Recent spending in ${shoppingCategories.slice(0, 2).join(', ')}`,
        topics: ['deals', 'sales', 'reviews']
      });
    }
  }
  
  // Use AI to extract additional high-value insights if we don't have enough
  // Only attempt AI extraction if OPENAI_API_KEY is configured
  if (insights.length < 3 && (memories.length > 0 || calendarEvents.length > 0) && process.env.OPENAI_API_KEY) {
    try {
      const memoryTexts = memories.slice(0, 10).map(m => m.memoryText).join('\n');
      const eventSummaries = calendarEvents.slice(0, 5).map(e => `${e.summary || 'Event'} at ${e.location || 'unknown location'}`).join('\n');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze personal data and extract 2-3 specific, actionable insights that would benefit from web searches.

Focus on:
- Upcoming trips or events that need preparation
- Hobbies or interests that could use product recommendations
- Professional topics that need industry news
- Health/wellness goals that need tips or research

Return JSON with array of objects:
{
  "insights": [
    {
      "type": "calendar|email|memory|financial",
      "summary": "Brief description of the insight",
      "location": "Optional location if relevant",
      "topics": ["2-3 specific search topics"]
    }
  ]
}

Be specific - not "travel" but "visiting Paris in February". Not "technology" but "best wireless earbuds for running".`
          },
          {
            role: "user",
            content: `Recent memories:\n${memoryTexts}\n\nUpcoming events:\n${eventSummaries}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const extracted = JSON.parse(response.choices[0].message.content || '{}');
      if (extracted.insights && Array.isArray(extracted.insights)) {
        insights.push(...extracted.insights.slice(0, 3 - insights.length));
      }
    } catch (error) {
      console.error('Failed to extract AI insights:', error);
    }
  }
  
  return insights;
}

export async function searchForDiscoveries(
  insights: InsightContext[],
  tavilyApiKey?: string
): Promise<{ discoveries: Discovery[]; error?: string }> {
  if (!tavilyApiKey) {
    return { discoveries: [], error: 'No Tavily API key configured. Add TAVILY_API_KEY in settings.' };
  }
  
  if (insights.length === 0) {
    return { discoveries: [], error: 'No insights found to search for discoveries.' };
  }
  
  const tvly = tavily({ apiKey: tavilyApiKey });
  const discoveries: Discovery[] = [];
  const seenUrls = new Set<string>();
  
  for (const insight of insights.slice(0, 4)) {
    // Build contextual search query
    const searchQuery = buildSearchQuery(insight);
    
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Tavily search: "${searchQuery}" for insight: ${insight.summary.slice(0, 50)}`);
      }
      
      const response = await tvly.search(searchQuery, {
        max_results: 3,
        search_depth: "basic",
        include_answer: false,
      }) as TavilySearchResponse;
      
      if (response.results && response.results.length > 0) {
        for (const result of response.results) {
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);
          
          discoveries.push({
            id: `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: result.title,
            content: result.content?.slice(0, 300) || '',
            url: result.url,
            source: extractDomain(result.url),
            insightContext: insight.summary,
            category: categorizeDiscovery(insight, result),
            relevanceScore: result.score || 0.5,
          });
        }
      }
    } catch (error) {
      console.error(`Tavily search failed for "${searchQuery}":`, error);
    }
  }
  
  // Sort by relevance and deduplicate similar content
  const uniqueDiscoveries = deduplicateDiscoveries(discoveries);
  
  return { discoveries: uniqueDiscoveries.slice(0, 10) };
}

function buildSearchQuery(insight: InsightContext): string {
  const topics = insight.topics.slice(0, 2).join(' ');
  
  if (insight.type === 'calendar' && insight.location) {
    // Travel-related search
    return `${insight.location} ${topics} tips recommendations`;
  }
  
  if (insight.type === 'email' && insight.topics.includes('travel')) {
    return `${topics} essentials checklist 2024`;
  }
  
  if (insight.type === 'financial') {
    return `best ${topics} ${new Date().getFullYear()}`;
  }
  
  // Default: use summary and topics
  const summaryWords = insight.summary.split(' ').slice(0, 5).join(' ');
  return `${summaryWords} ${topics}`;
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
  
  if (insight.type === 'calendar' && insight.location) {
    if (/hotel|flight|restaurant|attraction|things to do/i.test(text)) return 'travel';
    if (/news|update|event|happening/i.test(text)) return 'local';
  }
  
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
  
  return unique.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export async function getContextualDiscoveries(
  memories: Array<{ memoryText: string; topicTag?: string; detectedPeople?: string[]; locationName?: string }>,
  calendarEvents: Array<{ summary?: string; location?: string; start?: { dateTime?: string; date?: string } }>,
  emails: Array<{ subject?: string; snippet?: string; from?: string }>,
  financialData?: { merchants?: string[]; categories?: string[]; recentTransactions?: Array<{ name: string; amount: number }> },
  tavilyApiKey?: string
): Promise<DiscoveriesResponse> {
  const insights = await extractSearchableInsights(memories, calendarEvents, emails, financialData);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`Extracted ${insights.length} searchable insights`);
  }
  
  const result = await searchForDiscoveries(insights, tavilyApiKey);
  
  return {
    discoveries: result.discoveries,
    insights,
    generatedAt: new Date().toISOString(),
    error: result.error,
  };
}
