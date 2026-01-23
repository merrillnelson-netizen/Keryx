import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Newspaper, 
  ExternalLink,
  RefreshCw,
  Clock,
  AlertCircle,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Link } from "wouter";

interface NewsArticle {
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

interface UserInterests {
  topics: string[];
  people: string[];
  projects: string[];
  locations: string[];
  industries: string[];
}

interface RealNewsResponse {
  status: string;
  data: {
    articles: NewsArticle[];
    interests: UserInterests;
    generatedAt: string;
  };
  configured: boolean;
  message?: string;
}

const getCategoryColor = (category: NewsArticle['category']) => {
  switch (category) {
    case 'people': return 'text-blue-400 bg-blue-500/20';
    case 'projects': return 'text-orange-400 bg-orange-500/20';
    case 'calendar': return 'text-purple-400 bg-purple-500/20';
    case 'financial': return 'text-emerald-400 bg-emerald-500/20';
    case 'wellbeing': return 'text-pink-400 bg-pink-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function NewsArticleCard({ article }: { article: NewsArticle }) {
  const categoryColors = getCategoryColor(article.category);
  
  return (
    <a 
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block glass-card p-4 rounded-xl hover:bg-white/10 transition-all group"
    >
      <div className="flex gap-4">
        {article.imageUrl && (
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
            <img 
              src={article.imageUrl} 
              alt="" 
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {article.title}
            </h4>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {article.description}
          </p>
          
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{article.source}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(article.publishedAt)}
            </span>
            <Badge variant="outline" className={cn("text-xs capitalize ml-auto", categoryColors)}>
              {article.category}
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground mt-2 italic">
            {article.relevanceReason}
          </p>
        </div>
      </div>
    </a>
  );
}

export default function RealNewsFeed() {
  const { data, isLoading, isFetching, refetch } = useQuery<RealNewsResponse>({
    queryKey: ["/api/real-news"],
    queryFn: async () => {
      const response = await fetch("/api/real-news", { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  const articles = data?.data?.articles || [];
  const interests = data?.data?.interests;
  const configured = data?.configured ?? true;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/real-news"] });
    refetch();
  };

  return (
    <Card className="glass-card border-white/20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">News For You</CardTitle>
              <CardDescription>
                Real news filtered by your interests
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-white/20 hover:bg-white/10"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {!configured ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-2">News API Not Configured</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
              To see personalized news articles, add a NewsAPI key in your settings.
            </p>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="border-white/20">
                <Settings className="w-4 h-4 mr-2" />
                Configure in Settings
              </Button>
            </Link>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 rounded-xl">
                <div className="flex gap-4">
                  <Skeleton className="w-20 h-20 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-8">
            <Newspaper className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No news found</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Log more memories to help us understand your interests and find relevant news.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map(article => (
              <NewsArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
        
        {interests && interests.topics.length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-muted-foreground mb-2">Your interests:</p>
            <div className="flex flex-wrap gap-1">
              {interests.topics.map((topic, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-white/5">
                  {topic}
                </Badge>
              ))}
              {interests.industries.map((industry, i) => (
                <Badge key={`ind-${i}`} variant="outline" className="text-xs bg-white/5">
                  {industry}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
