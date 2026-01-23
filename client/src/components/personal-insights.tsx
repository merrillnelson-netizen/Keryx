import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Newspaper, 
  Users, 
  Briefcase, 
  Calendar, 
  Wallet, 
  Heart, 
  Star,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";

interface PersonalNewsStory {
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

interface NewsFeedResponse {
  status: string;
  data: {
    stories: PersonalNewsStory[];
    generatedAt: string;
    dataSources: {
      memories: number;
      calendars: number;
      emails: number;
      financial: boolean;
    };
  };
  dataSources: {
    memories: number;
    calendars: number;
    emails: number;
    financial: boolean;
  };
  cached: boolean;
  generatedAt: string;
}

const getCategoryIcon = (category: PersonalNewsStory['category']) => {
  switch (category) {
    case 'people': return Users;
    case 'projects': return Briefcase;
    case 'calendar': return Calendar;
    case 'financial': return Wallet;
    case 'wellbeing': return Heart;
    case 'highlights': return Star;
    default: return Newspaper;
  }
};

const getCategoryColor = (category: PersonalNewsStory['category']) => {
  switch (category) {
    case 'people': return 'text-blue-500 bg-blue-500/20 border-blue-500/30';
    case 'projects': return 'text-orange-500 bg-orange-500/20 border-orange-500/30';
    case 'calendar': return 'text-purple-500 bg-purple-500/20 border-purple-500/30';
    case 'financial': return 'text-emerald-500 bg-emerald-500/20 border-emerald-500/30';
    case 'wellbeing': return 'text-pink-500 bg-pink-500/20 border-pink-500/30';
    case 'highlights': return 'text-yellow-500 bg-yellow-500/20 border-yellow-500/30';
    default: return 'text-gray-500 bg-gray-500/20 border-gray-500/30';
  }
};

const getSentimentStyle = (sentiment: PersonalNewsStory['sentiment']) => {
  switch (sentiment) {
    case 'positive': return 'border-l-green-500';
    case 'negative': return 'border-l-red-500';
    case 'celebratory': return 'border-l-yellow-500';
    default: return 'border-l-blue-500';
  }
};

const getPriorityBadge = (priority: PersonalNewsStory['priority']) => {
  switch (priority) {
    case 'breaking':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Breaking</Badge>;
    case 'featured':
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">Featured</Badge>;
    default:
      return null;
  }
};

function NewsStoryCard({ story }: { story: PersonalNewsStory }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getCategoryIcon(story.category);
  const categoryColors = getCategoryColor(story.category);
  const sentimentStyle = getSentimentStyle(story.sentiment);
  
  return (
    <div 
      className={cn(
        "glass-card p-4 rounded-xl border-l-4 transition-all",
        sentimentStyle,
        story.priority === 'breaking' && "ring-1 ring-red-500/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          categoryColors.split(' ')[1]
        )}>
          {story.icon ? (
            <span className="text-lg">{story.icon}</span>
          ) : (
            <Icon className={cn("w-5 h-5", categoryColors.split(' ')[0])} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-semibold text-foreground leading-tight">{story.headline}</h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              {getPriorityBadge(story.priority)}
              <Badge variant="outline" className={cn("text-xs capitalize", categoryColors)}>
                {story.category}
              </Badge>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">{story.summary}</p>
          
          {(story.details || story.relatedItems?.length) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3 mr-1" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 mr-1" />
                  More details
                </>
              )}
            </Button>
          )}
          
          {expanded && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2 animate-fade-in">
              {story.details && (
                <p className="text-sm text-muted-foreground">{story.details}</p>
              )}
              {story.relatedItems && story.relatedItems.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {story.relatedItems.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-white/5">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PersonalInsights() {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const { data, isLoading, isFetching, refetch } = useQuery<NewsFeedResponse>({
    queryKey: ["/api/news-feed", userTimezone],
    queryFn: async () => {
      const response = await fetch(`/api/news-feed?timezone=${encodeURIComponent(userTimezone)}`, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 30,
  });

  const stories = data?.data?.stories || [];
  const dataSources = data?.dataSources;
  
  const breakingStories = stories.filter(s => s.priority === 'breaking');
  const featuredStories = stories.filter(s => s.priority === 'featured');
  const standardStories = stories.filter(s => s.priority === 'standard');

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/news-feed"] });
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
              <CardTitle className="text-xl">Personal Insights</CardTitle>
              <CardDescription>
                AI-generated insights from your ecosystem
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
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 rounded-xl border-l-4 border-l-blue-500/50">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-12">
            <Newspaper className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No news yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Start logging memories, connect your calendar and email to see personalized news stories about your life.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {breakingStories.length > 0 && (
              <div className="space-y-3">
                {breakingStories.map(story => (
                  <NewsStoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
            
            {featuredStories.length > 0 && (
              <div className="space-y-3">
                {featuredStories.map(story => (
                  <NewsStoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
            
            {standardStories.length > 0 && (
              <div className="space-y-3">
                {standardStories.map(story => (
                  <NewsStoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </div>
        )}
        
        {dataSources && (
          <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground border-t border-white/10">
            {dataSources.memories > 0 && (
              <span>{dataSources.memories} memories</span>
            )}
            {dataSources.calendars > 0 && (
              <>
                <span>•</span>
                <span>{dataSources.calendars} events</span>
              </>
            )}
            {dataSources.emails > 0 && (
              <>
                <span>•</span>
                <span>{dataSources.emails} emails</span>
              </>
            )}
            {dataSources.financial && (
              <>
                <span>•</span>
                <span>Financial data</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}