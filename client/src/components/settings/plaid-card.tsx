import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Settings } from "@shared/schema";
import {
  Landmark, Building2, CreditCard, Eye, EyeOff, Trash2,
  RefreshCcw, Plus, Loader2,
} from "lucide-react";

interface PlaidStatus {
  configured: boolean;
  enabled: boolean;
  featureDisabled?: boolean;
  includeInBriefings: boolean;
  transactionDays: number;
}

interface PlaidInstitution {
  id: number;
  itemId: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PlaidAccount {
  id: number;
  accountId: string;
  plaidItemId: number;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isHidden: boolean;
  institutionName?: string;
}

export function PlaidCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showBalances, setShowBalances] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: plaidStatus, isLoading: isPlaidLoading } = useQuery<PlaidStatus>({
    queryKey: ["/api/plaid/status"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: plaidInstitutions = [], refetch: refetchInstitutions } = useQuery<PlaidInstitution[]>({
    queryKey: ["/api/plaid/institutions"],
    enabled: plaidStatus?.configured && !plaidStatus?.featureDisabled,
    staleTime: 1000 * 60 * 10,
  });

  const { data: plaidAccounts = [], refetch: refetchAccounts } = useQuery<PlaidAccount[]>({
    queryKey: ["/api/plaid/accounts"],
    enabled: plaidStatus?.configured && !plaidStatus?.featureDisabled,
    staleTime: 1000 * 60 * 5,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Partial<Settings>) =>
      apiRequest("PUT", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const createLinkTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/plaid/link-token");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.linkToken) {
        setLinkToken(data.linkToken);
      }
    },
    onError: () => {
      toast({ title: "Failed to initialize bank connection", variant: "destructive" });
    },
  });

  const exchangeTokenMutation = useMutation({
    mutationFn: async ({ publicToken, institutionId, institutionName }: { publicToken: string; institutionId?: string; institutionName?: string }) => {
      const response = await apiRequest("POST", "/api/plaid/exchange-token", { publicToken, institutionId, institutionName });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/status"] });
      setLinkToken(null);
      toast({ title: "Bank account connected successfully" });
    },
    onError: () => {
      toast({ title: "Failed to connect bank account", variant: "destructive" });
    },
  });

  const disconnectInstitutionMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/plaid/institutions/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      toast({ title: "Bank disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect bank", variant: "destructive" });
    },
  });

  const toggleAccountVisibilityMutation = useMutation({
    mutationFn: async ({ accountId, hidden }: { accountId: string; hidden: boolean }) => {
      await apiRequest("PATCH", `/api/plaid/accounts/${accountId}/visibility`, { hidden });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
    },
    onError: () => {
      toast({ title: "Failed to update account visibility", variant: "destructive" });
    },
  });

  const syncTransactionsMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("POST", `/api/plaid/sync/${itemId}`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      toast({
        title: "Transactions synced",
        description: `Added: ${data.added}, Modified: ${data.modified}, Removed: ${data.removed}`,
      });
    },
    onError: () => {
      toast({ title: "Failed to sync transactions", variant: "destructive" });
    },
  });

  const onPlaidSuccess = useCallback((publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    exchangeTokenMutation.mutate({
      publicToken,
      institutionId: metadata?.institution?.institution_id,
      institutionName: metadata?.institution?.name,
    });
  }, [exchangeTokenMutation]);

  const onPlaidExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const { open: openPlaidLink, ready: plaidLinkReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  useEffect(() => {
    if (linkToken && plaidLinkReady) {
      openPlaidLink();
    }
  }, [linkToken, plaidLinkReady, openPlaidLink]);

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-emerald-500" />
          Financial Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPlaidLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : plaidStatus?.featureDisabled ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-600 dark:text-amber-400">Financial integration is not configured</p>
                <p className="text-xs mt-1">
                  Plaid credentials are required to enable bank account connections.
                  Please add your PLAID_CLIENT_ID and PLAID_SECRET to enable this feature.
                </p>
              </div>
            </div>
          </div>
        ) : !plaidStatus?.configured ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-600 dark:text-amber-400">Plaid credentials not found</p>
                <p className="text-xs mt-1">
                  Add your Plaid API credentials to connect bank accounts for spending insights.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your bank accounts to include spending insights in your morning briefings.
            </p>

            {plaidInstitutions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Connected Banks</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBalances(!showBalances)}
                    className="text-xs gap-1"
                  >
                    {showBalances ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showBalances ? 'Hide Balances' : 'Show Balances'}
                  </Button>
                </div>
                {plaidInstitutions.map((institution) => (
                  <div
                    key={institution.itemId}
                    className="p-3 rounded-lg bg-muted/20 border border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-emerald-500" />
                        <div>
                          <span className="text-sm font-medium">
                            {institution.institutionName || 'Unknown Bank'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              variant={institution.status === 'active' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {institution.status}
                            </Badge>
                            {institution.lastSyncedAt && (
                              <span className="text-xs text-muted-foreground">
                                Last synced: {new Date(institution.lastSyncedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => syncTransactionsMutation.mutate(String(institution.id))}
                          disabled={syncTransactionsMutation.isPending}
                          title="Sync transactions"
                          data-testid={`button-sync-${institution.id}`}
                        >
                          <RefreshCcw className={`w-4 h-4 ${syncTransactionsMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => disconnectInstitutionMutation.mutate(String(institution.id))}
                          disabled={disconnectInstitutionMutation.isPending}
                          title="Disconnect bank"
                          data-testid={`button-disconnect-${institution.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {plaidAccounts.filter(a => {
                      const inst = plaidInstitutions.find(i => i.id === a.plaidItemId);
                      return inst?.itemId === institution.itemId;
                    }).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        {plaidAccounts
                          .filter(a => {
                            const inst = plaidInstitutions.find(i => i.id === a.plaidItemId);
                            return inst?.itemId === institution.itemId;
                          })
                          .map((account) => (
                            <div
                              key={account.accountId}
                              className={`flex items-center justify-between p-2 rounded ${account.isHidden ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                <div>
                                  <span className="text-sm">{account.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {account.type}{account.subtype ? ` - ${account.subtype}` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {account.currentBalance !== null && (
                                  <span className="text-sm font-medium">
                                    {showBalances
                                      ? `$${account.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                      : '•••••'
                                    }
                                  </span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => toggleAccountVisibilityMutation.mutate({
                                    accountId: account.accountId,
                                    hidden: !account.isHidden,
                                  })}
                                  title={account.isHidden ? 'Show in briefings' : 'Hide from briefings'}
                                  data-testid={`button-visibility-${account.accountId}`}
                                >
                                  {account.isHidden ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => createLinkTokenMutation.mutate()}
              disabled={createLinkTokenMutation.isPending || exchangeTokenMutation.isPending}
              data-testid="button-connect-bank"
            >
              {createLinkTokenMutation.isPending || exchangeTokenMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {plaidInstitutions.length > 0 ? 'Connect Another Bank' : 'Connect Bank Account'}
            </Button>

            {plaidInstitutions.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Financial Features</Label>
                    <p className="text-xs text-muted-foreground">
                      Use connected bank data for insights and queries
                    </p>
                  </div>
                  <Switch
                    checked={settings?.plaidEnabled ?? false}
                    onCheckedChange={(checked) => {
                      updateSettingsMutation.mutate({ ...settings, plaidEnabled: checked });
                    }}
                    data-testid="switch-plaid-enabled"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Include in Briefings</Label>
                    <p className="text-xs text-muted-foreground">
                      Show spending insights in morning briefings
                    </p>
                  </div>
                  <Switch
                    checked={settings?.plaidIncludeInBriefings ?? true}
                    onCheckedChange={(checked) => {
                      updateSettingsMutation.mutate({ ...settings, plaidIncludeInBriefings: checked });
                    }}
                    disabled={!settings?.plaidEnabled}
                    data-testid="switch-plaid-briefings"
                  />
                </div>
              </div>
            )}

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Landmark className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p>
                  Bank connections are secured by Plaid and never share your login credentials with Keryx.
                  Your data is encrypted and used only for spending insights.
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
