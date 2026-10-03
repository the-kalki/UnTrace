/**
 * UnTrace - Reddit Chat & Direct Message Bulk Cleaner
 * Handles both Modern Reddit Chat (GraphQL / SendBird) and Legacy PMs (/message/messages)
 */

import { AdaptiveRateLimiter } from './rate-limiter.js';

export class RedditChatCleaner {
  constructor(apiClient, rateLimiter = null) {
    this.api = apiClient;
    this.rateLimiter = rateLimiter || new AdaptiveRateLimiter({ baseDelayMs: 600, maxDelayMs: 2500 });
    this.gqlUrl = 'https://gql.reddit.com';
    this.abortRequested = false;
  }

  abort() {
    this.abortRequested = true;
  }

  resetAbort() {
    this.abortRequested = false;
  }

  /**
   * Generates authorization headers for Reddit GraphQL Chat API
   */
  async getChatAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Modhash': this.api.modhash || ''
    };

    const chatToken = this.api.getChatToken ? this.api.getChatToken() : null;
    if (chatToken) {
      headers['Authorization'] = `Bearer ${chatToken}`;
    }

    return headers;
  }

  /**
   * Fetches legacy private messages (inbox & sent PMs)
   */
  async fetchLegacyPMs(maxCount = 500) {
    try {
      const allChildren = [];
      let after = null;
      const currentUsername = (this.api.username || '').toLowerCase();

      while (allChildren.length < maxCount) {
        const fetchLimit = Math.min(100, maxCount - allChildren.length);
        const res = await this.api.fetchDirectMessages(fetchLimit, after);
        const children = res?.data?.children || [];
        if (children.length === 0) break;

        allChildren.push(...children);
        after = res?.data?.after;
        if (!after) break;
      }

      return allChildren.map((child) => {
        const d = child.data || {};
        const otherParty = (d.author || '').toLowerCase() === currentUsername ? d.dest : d.author;
        return {
          id: d.name, // e.g. t4_xxxx
          channelId: `pm_${d.author || 'unknown'}_${d.dest || 'unknown'}`,
          type: 'pm',
          name: otherParty || d.author || d.dest || 'Direct Message',
          author: d.author,
          recipient: d.dest,
          subject: d.subject || '(no subject)',
          body: d.body || '',
          createdUtc: d.created_utc || Math.floor(Date.now() / 1000),
          isAuthor: (d.author || '').toLowerCase() === currentUsername,
          firstMessageName: d.first_message_name || null
        };
      });
    } catch (err) {
      console.warn('[ChatCleaner] Failed to fetch legacy PMs:', err.message);
      return [];
    }
  }

  /**
   * Deletes a legacy direct message / PM
   */
  async deleteLegacyPM(fullname) {
    return await this.api.deleteDirectMessage(fullname);
  }

  /**
   * Fetches modern chat conversations via GraphQL
   */
  async fetchModernChannels() {
    try {
      const headers = await this.getChatAuthHeaders();
      const query = `
        query UserChatChannels {
          identity {
            id
            name
          }
          chatChannels {
            edges {
              node {
                id
                channelUrl
                name
                memberCount
                lastMessage {
                  id
                  createdAt
                  author {
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const res = await fetch(this.gqlUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ query })
      });

      if (!res.ok) {
        throw new Error(`Chat API responded with HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawChannels = json.data?.chatChannels?.edges || [];

      return rawChannels.map((edge) => {
        const c = edge.node || {};
        return {
          id: c.id || c.channelUrl,
          channelUrl: c.channelUrl || c.id,
          name: c.name || 'Direct Conversation',
          memberCount: c.memberCount || 2,
          type: (c.memberCount && c.memberCount > 2) ? 'group' : 'direct',
          lastMessageAt: c.lastMessage?.createdAt || null,
          lastAuthor: c.lastMessage?.author?.name || null
        };
      });
    } catch (err) {
      // GraphQL direct chat query is proprietary/restricted; DOM bridge in active tab handles extraction
      return [];
    }
  }

  /**
   * Deletes a specific chat message via GraphQL mutation
   */
  async deleteModernMessage(messageId) {
    const headers = await this.getChatAuthHeaders();
    const mutation = `
      mutation DeleteMessage($input: DeleteMessageInput!) {
        deleteMessage(input: $input) {
          success
        }
      }
    `;

    const res = await fetch(this.gqlUrl, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        query: mutation,
        variables: { input: { messageId } }
      })
    });

    if (!res.ok) {
      if (res.status === 429) {
        await this.rateLimiter.handle429(res.headers.get('Retry-After'));
      }
      throw new Error(`Delete chat message failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Leaves or hides a chat channel
   */
  async leaveOrHideChannel(channelUrl) {
    try {
      const headers = await this.getChatAuthHeaders();
      const mutation = `
        mutation LeaveChatChannel($channelUrl: String!) {
          leaveChannel(channelUrl: $channelUrl) {
            success
          }
        }
      `;

      const res = await fetch(this.gqlUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          query: mutation,
          variables: { channelUrl }
        })
      });

      return res.ok;
    } catch (err) {
      console.warn('[ChatCleaner] Failed to leave/hide channel:', err.message);
      return false;
    }
  }

  /**
   * Orchestrates complete chat cleanup across Legacy PMs and Modern Chat
   * @param {Object} options Configuration options
   * @param {boolean} options.deletePMs Whether to delete legacy direct messages
   * @param {boolean} options.deleteModern Whether to delete modern chat messages
   * @param {Array<string>} options.selectedChannelIds Selected channel IDs to purge
   * @param {Function} onProgress Callback for status updates
   */
  async nukeChats(options = {}, onProgress = () => {}) {
    this.resetAbort();
    const { deletePMs = true, deleteModern = true, autoHide = true, selectedChannelIds = null } = options;
    const stats = {
      pmsDeleted: 0,
      modernMessagesDeleted: 0,
      channelsLeft: 0,
      errors: 0
    };

    onProgress({ stage: 'START', stats, message: 'Initiating chat nuke sequence...' });

    // 1. Process Legacy PMs
    if (deletePMs && !this.abortRequested) {
      onProgress({ stage: 'FETCH_PMS', stats, message: 'Harvesting legacy Direct Messages (PMs)...' });
      const pms = await this.fetchLegacyPMs(100);
      onProgress({ stage: 'PMS_DISCOVERED', stats, count: pms.length, message: `Discovered ${pms.length} legacy direct messages.` });

      for (const pm of pms) {
        if (this.abortRequested) break;

        // Skip if specific channel whitelist filter exists
        if (selectedChannelIds && !selectedChannelIds.includes(pm.id) && !selectedChannelIds.includes(pm.channelId)) {
          continue;
        }

        try {
          await this.rateLimiter.throttle();
          await this.deleteLegacyPM(pm.id);
          this.rateLimiter.recordSuccess();
          stats.pmsDeleted++;
          onProgress({
            stage: 'PM_DELETED',
            stats,
            target: pm.id,
            message: `Deleted PM with ${pm.recipient || pm.author}: "${pm.subject.slice(0, 24)}"`
          });
        } catch (err) {
          stats.errors++;
          onProgress({ stage: 'ERROR', stats, error: err.message, target: pm.id });
        }
      }
    }

    // 2. Process Modern Chat Channels
    if (deleteModern && !this.abortRequested) {
      onProgress({ stage: 'FETCH_MODERN', stats, message: 'Scanning modern Reddit Chat channels...' });
      const channels = await this.fetchModernChannels();
      onProgress({
        stage: 'MODERN_DISCOVERED',
        stats,
        count: channels.length,
        message: `Discovered ${channels.length} modern chat channels.`
      });

      for (const ch of channels) {
        if (this.abortRequested) break;
        if (selectedChannelIds && !selectedChannelIds.includes(ch.id) && !selectedChannelIds.includes(ch.channelUrl)) {
          continue;
        }

        try {
          if (autoHide) {
            await this.rateLimiter.throttle();
            const left = await this.leaveOrHideChannel(ch.channelUrl || ch.id);
            if (left) {
              stats.channelsLeft++;
              this.rateLimiter.recordSuccess();
              onProgress({
                stage: 'CHANNEL_LEFT',
                stats,
                target: ch.name,
                message: `Cleared & hid conversation channel: ${ch.name}`
              });
            }
          }
        } catch (err) {
          stats.errors++;
          onProgress({ stage: 'ERROR', stats, error: err.message, target: ch.id });
        }
      }
    }

    onProgress({
      stage: this.abortRequested ? 'ABORTED' : 'COMPLETE',
      stats,
      message: this.abortRequested ? 'Chat purge operation aborted by user.' : 'Chat purge complete.'
    });

    return stats;
  }
}

/**
 * Approximate parsing of chat timestamp to Epoch milliseconds
 * Handles Reddit relative times ("2y ago", "6mo", "3w", "5d", "Yesterday", "11:14 AM"),
 * ISO strings, and Unix timestamps.
 */
export function parseChatTimestamp(item) {
  if (!item) return Date.now();

  // 1. Unix timestamp (seconds or milliseconds)
  if (typeof item.createdUtc === 'number') {
    return item.createdUtc > 1e11 ? item.createdUtc : item.createdUtc * 1000;
  }

  // 2. ISO or formatted date string from GraphQL
  if (item.lastMessageAt || item.createdAt) {
    const parsed = new Date(item.lastMessageAt || item.createdAt).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  const rawTime = (item.time || item.preview || '').trim();
  if (!rawTime) {
    return Date.now();
  }

  const t = rawTime.toLowerCase();
  const now = Date.now();
  const ONE_DAY_MS = 86400 * 1000;

  // Years: "2y ago", "2 yr. ago", "2 years ago", "2y"
  const yrMatch = t.match(/(\d+)\s*(?:y|yr\.?|years?)\b/);
  if (yrMatch) {
    const yrs = parseInt(yrMatch[1], 10);
    return now - yrs * 365 * ONE_DAY_MS;
  }

  // Months: "6mo ago", "6 mo. ago", "6 months ago", "6mo"
  const moMatch = t.match(/(\d+)\s*(?:mo\.?|months?)\b/);
  if (moMatch) {
    const mos = parseInt(moMatch[1], 10);
    return now - mos * 30 * ONE_DAY_MS;
  }

  // Weeks: "3w ago", "3 wk. ago", "3 weeks ago", "3w"
  const wkMatch = t.match(/(\d+)\s*(?:w|wk\.?|weeks?)\b/);
  if (wkMatch) {
    const wks = parseInt(wkMatch[1], 10);
    return now - wks * 7 * ONE_DAY_MS;
  }

  // Days: "5d ago", "5 d. ago", "5 days ago", "5d"
  const dayMatch = t.match(/(\d+)\s*(?:d\.?|days?)\b/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return now - days * ONE_DAY_MS;
  }

  // "Yesterday"
  if (t.includes('yesterday')) {
    return now - ONE_DAY_MS;
  }

  // Hours: "3h ago", "3 hr. ago", "3 hours ago", "3h"
  const hrMatch = t.match(/(\d+)\s*(?:h|hr\.?|hours?)\b/);
  if (hrMatch) {
    const hrs = parseInt(hrMatch[1], 10);
    return now - hrs * 3600 * 1000;
  }

  // Minutes: "15m ago", "15 min. ago", "15 mins ago", "15m"
  const minMatch = t.match(/(\d+)\s*(?:m|min\.?|mins?|minutes?)\b/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return now - mins * 60 * 1000;
  }

  // Time of day: "11:14 am", "9:19 pm", "now"
  if (t.includes('am') || t.includes('pm') || t.includes('now')) {
    return now - 1800 * 1000; // Today
  }

  // Standard dates: "Sep 25", "Jan 12 2024", "10/12/2023"
  const parsedDate = new Date(rawTime).getTime();
  if (!isNaN(parsedDate)) {
    if (parsedDate > now) {
      return parsedDate - 365 * ONE_DAY_MS;
    }
    return parsedDate;
  }

  return now;
}

/**
 * Checks if a chat conversation is with a deleted or deactivated account
 */
export function isDeletedAccount(item) {
  if (!item) return false;
  const isDead = (str) => {
    if (!str || typeof str !== 'string') return false;
    const s = str.toLowerCase().trim();
    return (
      s === '[deleted]' ||
      s === 'deleted' ||
      s === 'ghost' ||
      s === '[unavailable]' ||
      s === 'unavailable' ||
      s === 'u/[deleted]' ||
      s.includes('deleted') ||
      s.includes('deactivated')
    );
  };

  const name = item.name;
  const author = item.author;
  const recipient = item.recipient;
  const preview = (item.preview || item.body || '').toLowerCase();

  return (
    isDead(name) ||
    isDead(author) ||
    isDead(recipient) ||
    preview.includes('[deleted]') ||
    preview.includes('account was deleted') ||
    preview.includes('user deactivated') ||
    preview.includes('failed to load user')
  );
}

/**
 * Filters an array of chat items by search, date range, account status, and type
 */
export function filterChatItems(items = [], filters = {}) {
  const {
    search = '',
    dateRange = 'all',
    accountStatus = 'all',
    channelType = 'all'
  } = filters;

  const query = search.trim().toLowerCase();
  const now = Date.now();
  const ONE_DAY_MS = 86400 * 1000;

  let maxAgeDays = null;
  if (dateRange === '7d') maxAgeDays = 7;
  else if (dateRange === '30d') maxAgeDays = 30;
  else if (dateRange === '90d') maxAgeDays = 90;
  else if (dateRange === '180d') maxAgeDays = 180;
  else if (dateRange === '365d') maxAgeDays = 365;

  return items.filter(item => {
    // 1. Channel Type filter
    if (channelType !== 'all') {
      const itemType = (item.type || 'direct').toLowerCase();
      if (channelType === 'pm' && itemType !== 'pm') return false;
      if (channelType === 'direct' && itemType !== 'direct') return false;
      if (channelType === 'group' && itemType !== 'group') return false;
    }

    // 2. Account Status filter
    const isDeleted = isDeletedAccount(item);
    if (accountStatus === 'deleted' && !isDeleted) return false;
    if (accountStatus === 'active' && isDeleted) return false;

    // 3. Date Range filter (Older than X days)
    if (maxAgeDays !== null) {
      const timestamp = parseChatTimestamp(item);
      const ageInDays = (now - timestamp) / ONE_DAY_MS;
      if (ageInDays < maxAgeDays) return false;
    }

    // 4. Search query filter
    if (query) {
      const matchName = (item.name || '').toLowerCase().includes(query);
      const matchAuthor = (item.author || '').toLowerCase().includes(query);
      const matchRecipient = (item.recipient || '').toLowerCase().includes(query);
      const matchPreview = (item.preview || '').toLowerCase().includes(query);
      const matchSubject = (item.subject || '').toLowerCase().includes(query);
      const matchBody = (item.body || '').toLowerCase().includes(query);

      if (!matchName && !matchAuthor && !matchRecipient && !matchPreview && !matchSubject && !matchBody) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Validates that a string candidate represents a genuine Reddit conversation name / user,
 * filtering out subreddits, comment counters, timestamps, and generic UI buttons.
 */
export function isValidConversationName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length === 0 || clean.length > 50) return false;

  // Reject subreddits (e.g. "r/memes", "r/DesiSexTalk", "u/r/memes")
  if (/^(?:u\/)?r\//i.test(clean) || clean.includes('/r/')) return false;

  // Reject comment counts (e.g. "33 comments", "8 comments", "1 comment")
  if (/\b\d+\s*comments?\b/i.test(clean)) return false;

  // Reject video/audio timestamps (e.g. "0:10", "1:23:45")
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(clean)) return false;

  // Reject generic controls and navigation items
  const IGNORED = new Set([
    'chats', 'requests', 'threads', 'messages', 'direct', 'all', 'new chat',
    'create', 'search', 'clear', 'share', 'reddit pro', 'save', 'hide', 'report',
    'reply', 'award', 'vote', 'upvote', 'downvote', 'join', 'joined', 'leave',
    'view thread', 'settings', 'notifications', 'home', 'popular', 'explore',
    'help', 'help center', 'user agreement', 'privacy policy', 'content policy',
    'accessibility', 'reddit rules', 'terms', 'about reddit', 'delete my messages',
    'hide conversations after deleting', 'upgrade', 'upgrade for a small one-time payment'
  ]);
  if (IGNORED.has(clean.toLowerCase())) return false;

  // Reject pure numbers or punctuation
  if (/^[\d\s\-_.,!@#$%^&*()]+$/.test(clean) && !clean.startsWith('u/')) return false;

  return true;
}

