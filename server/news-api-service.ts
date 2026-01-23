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

interface NewsAPIArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
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

export async function fetchRealNews(
  interests: UserInterests,
  apiKey?: string
): Promise<FetchNewsResult> {
  if (!apiKey) {
    return { articles: [], error: 'No API key configured' };
  }

  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();
  let lastError: string | undefined;
  
  const searchQueries = [
    ...interests.topics.slice(0, 3),
    ...interests.industries.slice(0, 2),
  ].filter(Boolean);
  
  for (const query of searchQueries.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: '5',
        apiKey: apiKey,
      });
      
      const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
      const data = await response.json();
      
      if (!response.ok || data.status === 'error') {
        // NewsAPI returns specific error codes
        const errorMsg = data.message || data.code || 'Unknown error';
        console.warn(`NewsAPI error for query "${query}":`, errorMsg);
        
        // Check for common NewsAPI limitations
        if (data.code === 'corsNotAllowed' || errorMsg.includes('localhost')) {
          lastError = 'NewsAPI free tier only works in development. Upgrade to a paid plan for production use.';
        } else if (data.code === 'rateLimited') {
          lastError = 'Rate limit exceeded. Please try again later.';
        } else {
          lastError = errorMsg;
        }
        continue;
      }
      
      for (const article of (data as NewsAPIResponse).articles || []) {
        if (seenUrls.has(article.url) || !article.title || article.title === '[Removed]') {
          continue;
        }
        seenUrls.add(article.url);
        
        const category = categorizeArticle(article, interests);
        
        articles.push({
          id: Buffer.from(article.url).toString('base64').slice(0, 20),
          title: article.title,
          description: article.description || '',
          url: article.url,
          source: article.source?.name || 'Unknown',
          publishedAt: article.publishedAt,
          imageUrl: article.urlToImage || undefined,
          relevanceReason: `Related to your interest in ${query}`,
          category,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch news for query "${query}":`, error);
      lastError = error instanceof Error ? error.message : 'Network error';
      continue;
    }
  }
  
  return { 
    articles: articles.slice(0, 10),
    error: articles.length === 0 ? lastError : undefined
  };
}

function categorizeArticle(
  article: NewsAPIArticle,
  interests: UserInterests
): NewsArticle['category'] {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  
  if (interests.people.some(p => text.includes(p.toLowerCase()))) {
    return 'people';
  }
  if (interests.projects.some(p => text.includes(p.toLowerCase()))) {
    return 'projects';
  }
  if (/finance|money|market|stock|invest|economy|bank/i.test(text)) {
    return 'financial';
  }
  if (/health|wellness|fitness|mental|medical|exercise/i.test(text)) {
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
