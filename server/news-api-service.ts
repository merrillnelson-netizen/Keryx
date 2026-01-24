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
- topics: Array of 3-5 news-searchable topics that balance specificity with discoverability. Use terms that frequently appear in news headlines (e.g., "artificial intelligence", "stock market", "climate change", "sports", "entertainment", "health"). Avoid overly specific phrases that rarely appear in news.
- projects: Array of 2-3 specific project/work areas mentioned
- industries: Array of 2-3 industries relevant to user (e.g., "finance", "technology", "healthcare", "education")
- locations: Array of relevant cities/regions for local news

IMPORTANT: Topics must be terms that news outlets actually use in headlines. Each topic should be DIFFERENT from others to get diverse results. Balance personalization with discoverability.`
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
/**
 * Calculate similarity between two titles using word overlap (Jaccard similarity)
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (text: string) => 
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2); // Ignore short words like "a", "the"
  
  const words1 = normalize(title1);
  const words2 = normalize(title2);
  const words1Set = new Set(words1);
  const words2Set = new Set(words2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const intersectionCount = words1.filter(w => words2Set.has(w)).length;
  const unionSize = new Set(words1.concat(words2)).size;
  
  return intersectionCount / unionSize;
}

/**
 * Extract key story identifiers (names, numbers, locations) to detect same story
 */
function extractStoryFingerprint(title: string): string {
  const normalized = title.toLowerCase();
  // Extract proper nouns, numbers, and key identifiers
  const numbers = normalized.match(/\d+/g) || [];
  const words = normalized.split(/\s+/).filter(w => w.length > 3);
  // Get the most distinctive words (longer, less common)
  const distinctiveWords = words
    .filter(w => !['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'will', 'been', 'says', 'said', 'after', 'about', 'what', 'which', 'their', 'more', 'could', 'would', 'into'].includes(w))
    .slice(0, 5);
  return [...distinctiveWords, ...numbers].join(' ');
}

/**
 * Group articles by similarity and limit duplicates
 * Returns deduplicated articles with max 2 versions of same story
 */
function deduplicateArticles(articles: NewsArticle[], maxVersionsPerStory: number = 2): NewsArticle[] {
  const storyGroups: Map<string, NewsArticle[]> = new Map();
  const SIMILARITY_THRESHOLD = 0.5; // 50% word overlap = same story
  
  for (const article of articles) {
    const fingerprint = extractStoryFingerprint(article.title);
    let foundGroup = false;
    
    // Check against existing story groups
    const groupEntries = Array.from(storyGroups.entries());
    for (const [groupKey, groupArticles] of groupEntries) {
      const representativeTitle = groupArticles[0].title;
      const similarity = calculateTitleSimilarity(article.title, representativeTitle);
      const fingerprintSimilarity = calculateTitleSimilarity(fingerprint, extractStoryFingerprint(representativeTitle));
      
      if (similarity >= SIMILARITY_THRESHOLD || fingerprintSimilarity >= 0.6) {
        groupArticles.push(article);
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      storyGroups.set(fingerprint, [article]);
    }
  }
  
  // Take only maxVersionsPerStory from each group, prioritizing diverse sources
  const result: NewsArticle[] = [];
  const groupValues = Array.from(storyGroups.values());
  for (const groupArticles of groupValues) {
    // Select articles with diverse sources using greedy selection
    const selected: NewsArticle[] = [];
    const usedSources = new Set<string>();
    
    // First pass: pick articles from unique sources
    for (const article of groupArticles) {
      if (selected.length >= maxVersionsPerStory) break;
      if (!usedSources.has(article.source)) {
        selected.push(article);
        usedSources.add(article.source);
      }
    }
    
    // Second pass: fill remaining slots if needed
    for (const article of groupArticles) {
      if (selected.length >= maxVersionsPerStory) break;
      if (!selected.includes(article)) {
        selected.push(article);
      }
    }
    
    result.push(...selected);
  }
  
  console.log(`Deduplication: ${articles.length} articles -> ${result.length} unique stories (${storyGroups.size} story groups)`);
  return result;
}

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
  
  // Build search queries from user interests - be more specific
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
      country: 'us', // Filter for US news to get local/relevant content
      size: '10', // Number of articles to return (max 10 on free tier)
    });
    
    const response = await fetch(`https://newsdata.io/api/1/latest?${params}`);
    const data = await response.json();
    
    // Log the raw response for debugging
    console.log('NewsData.io response status:', data.status, 'totalResults:', data.totalResults);
    
    if (data.status !== 'success') {
      const errorMsg = data.message || data.code || data.results?.message || 'Unknown error';
      console.warn(`NewsData.io error:`, JSON.stringify(data));
      
      if (errorMsg.includes('rate limit') || errorMsg.includes('API limit')) {
        lastError = 'Daily API limit reached. Please try again tomorrow.';
      } else if (errorMsg.includes('Invalid API key')) {
        lastError = 'Invalid API key. Please check your NEWSDATA_API_KEY setting.';
      } else {
        lastError = errorMsg;
      }
      return { articles: [], error: lastError };
    }
    
    const results = (data as NewsDataResponse).results || [];
    console.log(`NewsData.io returned ${results.length} articles for query: "${combinedQuery}"`);
    
    for (const article of results) {
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
  
  // Apply deduplication to limit same story to max 2 versions
  const deduplicatedArticles = deduplicateArticles(articles, 2);
  
  return { 
    articles: deduplicatedArticles.slice(0, 10),
    error: deduplicatedArticles.length === 0 ? lastError : undefined
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
  newsDataApiKey?: string
): Promise<PersonalizedNewsResponse> {
  const interests = await extractUserInterests(memories, calendarEvents, financialData);
  const result = await fetchRealNews(interests, newsDataApiKey);
  
  return {
    articles: result.articles,
    interests,
    generatedAt: new Date().toISOString(),
    error: result.error,
  };
}
