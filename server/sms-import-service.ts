import { storage } from "./storage";
import type { InsertMessage } from "@shared/schema";

interface SmsExportEntry {
  _id?: number;
  address?: string;
  body?: string;
  date?: number | string;
  date_sent?: number | string;
  type?: number;
  read?: number;
  thread_id?: number;
  sub_id?: number;
  __display_name?: string;
  msg_box?: number;
  m_type?: number;
  ct_t?: string;
  __parts?: Array<{
    _id?: number;
    ct?: string;
    text?: string;
    _data?: string;
  }>;
}

function parseSmsTimestamp(raw: number | string | undefined): Date | null {
  if (raw === undefined || raw === null) return null;
  const num = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (isNaN(num)) return null;
  let d = new Date(num);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 2000) d = new Date(num * 1000);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  return d;
}

interface ImportResult {
  totalParsed: number;
  newMessages: number;
  duplicates: number;
  conversations: number;
  errors: number;
  dateRange?: { start: string; end: string };
}

export async function parseAndImportNDJSON(
  userId: string,
  fileContent: string,
  batchId: string,
  fileName?: string
): Promise<ImportResult> {
  const result: ImportResult = {
    totalParsed: 0,
    newMessages: 0,
    duplicates: 0,
    conversations: 0,
    errors: 0,
  };

  const conversationMap = new Map<string, {
    contactAddress: string;
    contactName: string | null;
    platform: string;
    threadId: string | null;
    messages: InsertMessage[];
    latestTimestamp: Date | null;
  }>();

  let entries: SmsExportEntry[] = [];

  const trimmed = fileContent.trim();

  if (trimmed.startsWith('<') || trimmed.startsWith('<?xml')) {
    throw new Error("XML format detected. Please re-export using JSON (NDJSON) format in the SMS Import / Export app.");
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    } catch {
    }
  }

  if (entries.length === 0) {
    const lines = trimmed.split('\n').filter(line => line.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        if (Array.isArray(parsed)) {
          entries.push(...parsed);
        } else {
          entries.push(parsed);
        }
      } catch {
        result.errors++;
      }
    }
  }

  if (entries.length === 0) {
    throw new Error("Could not parse the file. Make sure you export as JSON (NDJSON) format from the SMS Import / Export app.");
  }

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const entry of entries) {
    try {
      result.totalParsed++;

      let body = entry.body || '';
      let address = entry.address || '';
      let displayName = entry.__display_name || null;
      let direction: 'sent' | 'received' = 'received';
      let messageType = 'sms';
      let timestamp: Date;

      if (entry.__parts && !body) {
        const textParts = entry.__parts.filter(p => p.ct === 'text/plain' && p.text);
        body = textParts.map(p => p.text).join(' ');
        messageType = 'mms';
      }

      if (entry.type === 2 || entry.msg_box === 2) {
        direction = 'sent';
      }

      const parsed = parseSmsTimestamp(entry.date) || parseSmsTimestamp(entry.date_sent);
      if (!parsed) continue;
      timestamp = parsed;

      if (!address) continue;

      if (!body || body.trim().length === 0) continue;

      if (minDate === null || timestamp < minDate) minDate = timestamp;
      if (maxDate === null || timestamp > maxDate) maxDate = timestamp;

      const externalId = `sms_${entry._id || ''}_${entry.date || ''}_${address}`;

      const normalizedAddress = normalizePhoneNumber(address);
      const convKey = `${normalizedAddress}_sms`;

      if (!conversationMap.has(convKey)) {
        conversationMap.set(convKey, {
          contactAddress: normalizedAddress,
          contactName: displayName,
          platform: 'sms',
          threadId: entry.thread_id?.toString() || null,
          messages: [],
          latestTimestamp: null,
        });
      }

      const conv = conversationMap.get(convKey)!;
      if (displayName && !conv.contactName) {
        conv.contactName = displayName;
      }
      if (!conv.latestTimestamp || timestamp > conv.latestTimestamp) {
        conv.latestTimestamp = timestamp;
      }

      conv.messages.push({
        userId,
        conversationId: '',
        externalId,
        source: 'sms_import',
        direction,
        senderAddress: direction === 'received' ? normalizedAddress : null,
        senderName: direction === 'received' ? displayName : null,
        body: body.trim(),
        messageType,
        timestamp,
        aiProcessed: false,
        importBatchId: batchId,
        rawMetadata: {
          originalId: entry._id,
          threadId: entry.thread_id,
          read: entry.read,
          subId: entry.sub_id,
        },
      });
    } catch {
      result.errors++;
    }
  }

  const convEntries = Array.from(conversationMap.values());
  for (const convData of convEntries) {
    try {
      const safeLastMessageAt = convData.latestTimestamp && !isNaN(convData.latestTimestamp.getTime())
        ? convData.latestTimestamp
        : new Date();
      const conversation = await storage.upsertMessageConversation({
        userId,
        contactAddress: convData.contactAddress,
        contactName: convData.contactName,
        platform: convData.platform,
        threadId: convData.threadId,
        lastMessageAt: safeLastMessageAt,
        messageCount: 0,
        unprocessedCount: 0,
      });

      const existingCheck = new Set<string>();
      const batchSize = 100;
      for (let i = 0; i < convData.messages.length; i += batchSize) {
        const chunk = convData.messages.slice(i, i + batchSize);
        const externalIds = chunk.map((m: InsertMessage) => m.externalId).filter(Boolean) as string[];

        for (const eid of externalIds) {
          const exists = await storage.messageExistsByExternalId(userId, eid, 'sms_import');
          if (exists) existingCheck.add(eid);
        }
      }

      const newMessages: InsertMessage[] = [];
      for (const msg of convData.messages) {
        if (msg.externalId && existingCheck.has(msg.externalId)) {
          result.duplicates++;
        } else {
          newMessages.push({
            ...msg,
            conversationId: conversation.id,
          });
        }
      }

      if (newMessages.length > 0) {
        const inserted = await storage.createMessagesBatch(newMessages);
        result.newMessages += inserted;

        await storage.upsertMessageConversation({
          userId,
          contactAddress: convData.contactAddress,
          contactName: convData.contactName,
          platform: convData.platform,
          threadId: convData.threadId,
          lastMessageAt: safeLastMessageAt,
          messageCount: inserted,
          unprocessedCount: inserted,
        });
      }

      result.conversations++;
    } catch (error) {
      console.error(`Failed to process conversation for ${convData.contactAddress}:`, error);
      result.errors += convData.messages.length;
    }
  }

  if (minDate && maxDate && !isNaN(minDate.getTime()) && !isNaN(maxDate.getTime())) {
    result.dateRange = {
      start: minDate.toISOString(),
      end: maxDate.toISOString(),
    };
  }

  return result;
}

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
