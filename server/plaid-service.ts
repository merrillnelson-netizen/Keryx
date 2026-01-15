import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, TransactionsSyncRequest } from 'plaid';
import { db } from './db';
import { plaidItems, financialAccounts, financialTransactions } from '@shared/schema';
import { eq, and, desc, gte, inArray } from 'drizzle-orm';

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox') as keyof typeof PlaidEnvironments;

let plaidClient: PlaidApi | null = null;

function getPlaidClient(): PlaidApi {
  if (!plaidClient) {
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      throw new Error('Plaid credentials not configured');
    }
    
    const configuration = new Configuration({
      basePath: PlaidEnvironments[PLAID_ENV],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
          'PLAID-SECRET': PLAID_SECRET,
        },
      },
    });
    
    plaidClient = new PlaidApi(configuration);
  }
  return plaidClient;
}

export function isPlaidConfigured(): boolean {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
}

export async function createLinkToken(userId: string): Promise<string> {
  const client = getPlaidClient();
  
  // Transactions is the primary product for financial insights
  // Balance is included automatically with Transactions
  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Helix',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  
  return response.data.link_token;
}

export async function exchangePublicToken(
  userId: string, 
  publicToken: string,
  institutionId?: string,
  institutionName?: string
): Promise<{ itemId: string; accounts: any[] }> {
  const client = getPlaidClient();
  
  const exchangeResponse = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });
  
  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;
  
  const [plaidItem] = await db.insert(plaidItems).values({
    userId,
    itemId,
    accessToken,
    institutionId: institutionId || null,
    institutionName: institutionName || null,
    status: 'active',
  }).returning();
  
  const accountsResponse = await client.accountsGet({ access_token: accessToken });
  const accounts = accountsResponse.data.accounts;
  
  // Batch insert all accounts
  const accountValues = accounts.map(account => ({
    userId,
    plaidItemId: plaidItem.id,
    accountId: account.account_id,
    name: account.name,
    officialName: account.official_name || null,
    type: account.type,
    subtype: account.subtype || null,
    mask: account.mask || null,
    currentBalance: account.balances.current,
    availableBalance: account.balances.available,
    isoCurrencyCode: account.balances.iso_currency_code || 'USD',
    lastBalanceUpdate: new Date(),
  }));
  
  const insertedAccounts = accountValues.length > 0
    ? await db.insert(financialAccounts).values(accountValues).returning()
    : [];
  
  return { itemId: plaidItem.id, accounts: insertedAccounts };
}

export async function syncTransactions(userId: string, plaidItemId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  const client = getPlaidClient();
  
  const [item] = await db.select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)))
    .limit(1);
  
  if (!item) {
    throw new Error('Plaid item not found');
  }
  
  const userAccounts = await db.select()
    .from(financialAccounts)
    .where(eq(financialAccounts.plaidItemId, plaidItemId));
  
  const accountIdMap = new Map(userAccounts.map(a => [a.accountId, a.id]));
  
  let added = 0;
  let modified = 0;
  let removed = 0;
  let cursor = item.cursor || undefined;
  let hasMore = true;
  
  while (hasMore) {
    const request: TransactionsSyncRequest = {
      access_token: item.accessToken,
      cursor,
    };
    
    const response = await client.transactionsSync(request);
    const data = response.data;
    
    // Batch insert added transactions
    const toInsert = data.added
      .filter(txn => accountIdMap.has(txn.account_id))
      .map(txn => ({
        userId,
        accountId: accountIdMap.get(txn.account_id)!,
        transactionId: txn.transaction_id,
        amount: txn.amount,
        isoCurrencyCode: txn.iso_currency_code || 'USD',
        date: new Date(txn.date),
        name: txn.name,
        merchantName: txn.merchant_name || null,
        category: txn.category || [],
        primaryCategory: txn.category?.[0] || null,
        pending: txn.pending,
        paymentChannel: txn.payment_channel || null,
        location: txn.location ? {
          address: txn.location.address,
          city: txn.location.city,
          region: txn.location.region,
          postalCode: txn.location.postal_code,
          country: txn.location.country,
          lat: txn.location.lat,
          lon: txn.location.lon,
        } : null,
      }));
    
    if (toInsert.length > 0) {
      await db.insert(financialTransactions).values(toInsert).onConflictDoNothing();
      added += toInsert.length;
    }
    
    // Parallel update modified transactions (individual updates due to different values per row)
    if (data.modified.length > 0) {
      const toModify = data.modified.filter(txn => accountIdMap.has(txn.account_id));
      await Promise.all(toModify.map(txn => 
        db.update(financialTransactions)
          .set({
            amount: txn.amount,
            name: txn.name,
            merchantName: txn.merchant_name || null,
            category: txn.category || [],
            primaryCategory: txn.category?.[0] || null,
            pending: txn.pending,
          })
          .where(eq(financialTransactions.transactionId, txn.transaction_id))
      ));
      modified += toModify.length;
    }
    
    // Batch delete removed transactions using inArray
    if (data.removed.length > 0) {
      const removedIds = data.removed.map(txn => txn.transaction_id);
      await db.delete(financialTransactions)
        .where(inArray(financialTransactions.transactionId, removedIds));
      removed += data.removed.length;
    }
    
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }
  
  await db.update(plaidItems)
    .set({ 
      cursor,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(plaidItems.id, plaidItemId));
  
  return { added, modified, removed };
}

export async function updateAccountBalances(userId: string, plaidItemId: string): Promise<void> {
  const client = getPlaidClient();
  
  const [item] = await db.select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)))
    .limit(1);
  
  if (!item) {
    throw new Error('Plaid item not found');
  }
  
  const response = await client.accountsGet({ access_token: item.accessToken });
  
  for (const account of response.data.accounts) {
    await db.update(financialAccounts)
      .set({
        currentBalance: account.balances.current,
        availableBalance: account.balances.available,
        lastBalanceUpdate: new Date(),
      })
      .where(eq(financialAccounts.accountId, account.account_id));
  }
}

export async function getConnectedInstitutions(userId: string) {
  return db.select()
    .from(plaidItems)
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.status, 'active')))
    .orderBy(desc(plaidItems.createdAt));
}

export async function getAccounts(userId: string) {
  return db.select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.isHidden, false)))
    .orderBy(financialAccounts.name);
}

export async function getRecentTransactions(userId: string, days: number = 7, limit: number = 50) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return db.select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      gte(financialTransactions.date, since)
    ))
    .orderBy(desc(financialTransactions.date))
    .limit(limit);
}

export async function getSpendingSummary(userId: string, days: number = 7) {
  const transactions = await getRecentTransactions(userId, days, 500);
  
  const totalSpending = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const categoryBreakdown: Record<string, number> = {};
  for (const t of transactions) {
    if (t.amount > 0 && t.primaryCategory) {
      categoryBreakdown[t.primaryCategory] = (categoryBreakdown[t.primaryCategory] || 0) + t.amount;
    }
  }
  
  const topMerchants: Record<string, number> = {};
  for (const t of transactions) {
    if (t.amount > 0) {
      const merchant = t.merchantName || t.name;
      topMerchants[merchant] = (topMerchants[merchant] || 0) + t.amount;
    }
  }
  
  return {
    totalSpending: Math.round(totalSpending * 100) / 100,
    transactionCount: transactions.length,
    categoryBreakdown: Object.entries(categoryBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 })),
    topMerchants: Object.entries(topMerchants)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([merchant, amount]) => ({ merchant, amount: Math.round(amount * 100) / 100 })),
  };
}

export async function disconnectItem(userId: string, plaidItemId: string): Promise<void> {
  const client = getPlaidClient();
  
  const [item] = await db.select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.userId, userId)))
    .limit(1);
  
  if (!item) {
    throw new Error('Plaid item not found');
  }
  
  try {
    await client.itemRemove({ access_token: item.accessToken });
  } catch (error) {
    console.error('Failed to remove item from Plaid:', error);
  }
  
  await db.update(plaidItems)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(eq(plaidItems.id, plaidItemId));
}

export async function hideAccount(userId: string, accountId: string, hidden: boolean): Promise<void> {
  await db.update(financialAccounts)
    .set({ isHidden: hidden })
    .where(and(
      eq(financialAccounts.id, accountId),
      eq(financialAccounts.userId, userId)
    ));
}
