import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  relevanceReason: string;
  category: 'people' | 'projects' | 'calendar' | 'financial' | 'wellbeing' | 'general';
}

export interface UserInterests {
  topics: string[];
  people: string[];
  projects: string[];
  locations: string[];
  industries: string[];
}

export interface RealNewsResponse {
  articles: NewsArticle[];
  interests: UserInterests;
  generatedAt: string;
}

// NewsData.io API response types
interface NewsDataArticle {
  article_id: string;
  title: string;
  link: string;
  description: string | null;
  source_name: string;
  source_icon?: string;
  image_url: string | null;
  pubDate: string;
  category: string[];
  country: string[];
  language: string;
  keywords?: string[];
}

interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: NewsDataArticle[];
  nextPage?: string;
}

export async function extractUserInterests(
  memories: Array<{ memoryText: string; topicTag?: string; detectedPeople?: string[] }>,
  calendarEvents: Array<{ summary?: string; location?: string }>,
  financialData?: { merchants?: string[]; categories?: string[] }
): Promise<UserInterests> {
  const memoryTexts = memories.slice(0, 30).map(m => m.memoryText).join('\n');
  const topics = Array.from(new Set(memories.map(m => m.topicTag).filter((t): t is string => Boolean(t))));
  const people = Array.from(new Set(memories.flatMap(m => m.detectedPeople || [])));
  const eventSummaries = calendarEvents.slice(0, 10).map(e => e.summary).filter(Boolean).join(', ');
  const locations = Array.from(new Set(calendarEvents.map(e => e.location).filter((l): l is string => Boolean(l))));
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Extract news-relevant interests from personal data. Return JSON with:
- topics: Array of 3-5 broad news topics/industries to search (e.g., "technology", "finance", "healthcare", "AI", "real estate")
- projects: Array of 2-3 specific project/work areas mentioned
- industries: Array of 2-3 relevant industries
- locations: Array of relevant cities/regions for local news

Focus on topics that would appear in news articles. Be specific but searchable.`
        },
        {
          role: "user",
          content: `Recent memories:\n${memoryTexts}\n\nTopics: ${topics.join(', ')}\nPeople: ${people.join(', ')}\nCalendar events: ${eventSummaries}\nLocations: ${locations.join(', ')}\nFinancial categories: ${financialData?.categories?.join(', ') || 'none'}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const extracted = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      topics: extracted.topics || ['technology', 'business'],
      people: people.slice(0, 5),
      projects: extracted.projects || [],
      locations: extracted.locations || locations.slice(0, 3),
      industries: extracted.industries || [],
    };
  } catch (error) {
    return {
      topics: topics.length > 0 ? topics.slice(0, 5) : ['technology', 'business'],
      people: people.slice(0, 5),
      projects: [],
      locations: locations.slice(0, 3),
      industries: [],
    };
  }
}

export interface FetchNewsResult {
  articles: NewsArticle[];
  error?: string;
}

/**
 * Fetch news articles from NewsData.io API
 * Free tier: 200 requests/day, works in production
 */
export async function fetchRealNews(
  interests: UserInterests,
  apiKey?: string
): Promise<FetchNewsResult> {
  if (!apiKey) {
    return { articles: [], error: 'No API key configured. Add NEWSDATA_API_KEY in settings.' };
  }

  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();
  let lastError: string | undefined;
  
  // Build search queries from user interests
  const searchQueries = [
    ...interests.topics.slice(0, 3),
    ...interests.industries.slice(0, 2),
  ].filter(Boolean);
  
  // NewsData.io allows combining queries with OR, so we can make fewer API calls
  const combinedQuery = searchQueries.slice(0, 3).join(' OR ');
  
  if (!combinedQuery) {
    return { articles: [], error: 'No interests found to search for news.' };
  }
  
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: combinedQuery,
      language: 'en',
      size: '10', // Number of articles to return (max 10 on free tier)
    });
    
    const response = await fetch(`https://newsdata.io/api/1/latest?${params}`);
    const data: NewsDataResponse = await response.json();
    
    if (data.status !== 'success') {
      const errorData = data as unknown as { message?: string; code?: string };
      const errorMsg = errorData.message || errorData.code || 'Unknown error';
      console.warn(`NewsData.io error:`, errorMsg);
      
      if (errorMsg.includes('rate limit') || errorMsg.includes('API limit')) {
        lastError = 'Daily API limit reached. Please try again tomorrow.';
      } else if (errorMsg.includes('Invalid API key')) {
        lastError = 'Invalid API key. Please check your NEWSDATA_API_KEY setting.';
      } else {
        lastError = errorMsg;
      }
      return { articles: [], error: lastError };
    }
    
    for (const article of data.results || []) {
      if (seenUrls.has(article.link) || !article.title) {
        continue;
      }
      seenUrls.add(article.link);
      
      const category = categorizeNewsDataArticle(article, interests);
      const relevanceReason = findRelevanceReason(article, interests, searchQueries);
      
      articles.push({
        id: article.article_id,
        title: article.title,
        description: article.description || '',
        url: article.link,
        source: article.source_name || 'Unknown',
        publishedAt: article.pubDate,
        imageUrl: article.image_url || undefined,
        relevanceReason,
        category,
      });
    }
  } catch (error) {
    console.error('Failed to fetch news from NewsData.io:', error);
    lastError = error instanceof Error ? error.message : 'Network error';
  }
  
  return { 
    articles: articles.slice(0, 10),
    error: articles.length === 0 ? lastError : undefined
  };
}

function findRelevanceReason(
  article: NewsDataArticle,
  interests: UserInterests,
  searchQueries: string[]
): string {
  const text = `${article.title} ${article.description || ''} ${(article.keywords || []).join(' ')}`.toLowerCase();
  
  // Check which search query matched
  for (const query of searchQueries) {
    if (text.includes(query.toLowerCase())) {
      return `Related to your interest in ${query}`;
    }
  }
  
  // Check article categories
  if (article.category && article.category.length > 0) {
    return `From ${article.category[0]} news`;
  }
  
  return 'Personalized for you';
}

function categorizeNewsDataArticle(
  article: NewsDataArticle,
  interests: UserInterests
): NewsArticle['category'] {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  const categories = article.category || [];
  
  // Check if it matches people the user knows
  if (interests.people.some(p => text.includes(p.toLowerCase()))) {
    return 'people';
  }
  
  // Check if it matches user's projects
  if (interests.projects.some(p => text.includes(p.toLowerCase()))) {
    return 'projects';
  }
  
  // Check article categories and content for classification
  if (categories.includes('business') || /finance|money|market|stock|invest|economy|bank/i.test(text)) {
    return 'financial';
  }
  if (categories.includes('health') || /health|wellness|fitness|mental|medical|exercise/i.test(text)) {
    return 'wellbeing';
  }
  if (/meeting|event|conference|schedule/i.test(text)) {
    return 'calendar';
  }
  
  return 'general';
}

export interface PersonalizedNewsResponse extends RealNewsResponse {
  error?: string;
}

export async function getPersonalizedNews(
  memories: Array<{ memoryText: string; topicTag?: string; detectedPeople?: string[] }>,
  calendarEvents: Array<{ summary?: string; location?: string }>,
  financialData?: { merchants?: string[]; categories?: string[] },
  newsApiKey?: string
): Promise<PersonalizedNewsResponse> {
  const interests = await extractUserInterests(memories, calendarEvents, financialData);
  const result = await fetchRealNews(interests, newsApiKey);
  
  return {
    articles: result.articles,
    interests,
    generatedAt: new Date().toISOString(),
    error: result.error,
  };
}
