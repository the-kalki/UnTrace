/**
 * UnTrace - Unit & Mock Integration Test Suite for Reddit Chat & DM Deletion
 */

import assert from 'node:assert';
import { RedditChatCleaner, parseChatTimestamp, isDeletedAccount, filterChatItems, isValidConversationName } from '../src/core/chat-cleaner.js';
import { HistoryExporter } from '../src/core/exporter.js';
import { AdaptiveRateLimiter } from '../src/core/rate-limiter.js';

console.log('🧪 Starting Chat & DM Deletion Test Suite...');

// 1. Test Auth Headers
{
  const mockApi = {
    username: 'test_user',
    modhash: 'modhash_12345',
    getChatToken: () => 'bearer_token_abc123'
  };

  const cleaner = new RedditChatCleaner(mockApi);
  const headers = await cleaner.getChatAuthHeaders();

  assert.strictEqual(headers['X-Modhash'], 'modhash_12345');
  assert.strictEqual(headers['Authorization'], 'Bearer bearer_token_abc123');
  assert.strictEqual(headers['Content-Type'], 'application/json');
  console.log('✅ Chat auth headers generation tests passed.');
}

// 2. Test Legacy PM Fetch & Normalization
{
  const mockApi = {
    username: 'test_user',
    modhash: 'modhash_12345',
    fetchDirectMessages: async (limit) => ({
      data: {
        children: [
          {
            data: {
              name: 't4_msg1',
              author: 'friend_user',
              dest: 'test_user',
              subject: 'Hey there',
              body: 'Secret conversation content',
              created_utc: 1700000000
            }
          },
          {
            data: {
              name: 't4_msg2',
              author: 'test_user',
              dest: 'friend_user',
              subject: 'Re: Hey there',
              body: 'My reply to friend',
              created_utc: 1700000500
            }
          }
        ]
      }
    })
  };

  const cleaner = new RedditChatCleaner(mockApi);
  const pms = await cleaner.fetchLegacyPMs(10);

  assert.strictEqual(pms.length, 2);
  assert.strictEqual(pms[0].id, 't4_msg1');
  assert.strictEqual(pms[0].author, 'friend_user');
  assert.strictEqual(pms[0].name, 'friend_user');
  assert.strictEqual(pms[0].isAuthor, false);
  assert.strictEqual(pms[1].id, 't4_msg2');
  assert.strictEqual(pms[1].name, 'friend_user');
  assert.strictEqual(pms[1].isAuthor, true);

  // Test pagination across multiple pages
  let callCount = 0;
  const paginatedApi = {
    username: 'test_user',
    modhash: 'modhash_123',
    fetchDirectMessages: async (limit, after) => {
      callCount++;
      if (callCount === 1) {
        return {
          data: {
            children: [{ data: { name: 't4_p1', author: 'user1', dest: 'test_user', body: 'page 1' } }],
            after: 't4_p1'
          }
        };
      }
      return {
        data: {
          children: [{ data: { name: 't4_p2', author: 'user2', dest: 'test_user', body: 'page 2' } }],
          after: null
        }
      };
    }
  };
  const paginatedCleaner = new RedditChatCleaner(paginatedApi);
  const allPMs = await paginatedCleaner.fetchLegacyPMs(100);
  assert.strictEqual(allPMs.length, 2);
  assert.strictEqual(allPMs[0].id, 't4_p1');
  assert.strictEqual(allPMs[1].id, 't4_p2');
  assert.strictEqual(callCount, 2);

  console.log('✅ Legacy PM normalization and multi-page pagination tests passed.');
}

// 3. Test Chat Backup JSON Compilation
{
  const samplePMs = [
    {
      id: 't4_msg1',
      author: 'alice',
      recipient: 'bob',
      subject: 'Hello',
      body: 'Test body',
      createdUtc: 1700000000,
      isAuthor: false
    }
  ];

  const sampleChannels = [
    {
      id: 'channel_xyz',
      name: 'Secret Group',
      type: 'group',
      memberCount: 4,
      lastMessageAt: '2026-01-01T00:00:00Z',
      lastAuthor: 'carol'
    }
  ];

  const backup = HistoryExporter.compileChatBackup('bob', samplePMs, sampleChannels);

  assert.strictEqual(backup.username, 'bob');
  assert.strictEqual(backup.metadata.totalPMs, 1);
  assert.strictEqual(backup.metadata.totalChannels, 1);
  assert.strictEqual(backup.metadata.totalItems, 2);
  assert.strictEqual(backup.directMessages[0].id, 't4_msg1');
  assert.strictEqual(backup.chatChannels[0].name, 'Secret Group');
  console.log('✅ Chat backup compilation tests passed.');
}

// 4. Test Chat Nuke Orchestration & Progress Callbacks
{
  const deletedMsgIds = [];
  const leftChannelUrls = [];
  const progressEvents = [];

  const mockApi = {
    username: 'test_user',
    modhash: 'modhash_12345',
    fetchDirectMessages: async () => ({
      data: {
        children: [
          { data: { name: 't4_1', author: 'test_user', dest: 'u2', subject: 'S1', body: 'B1' } },
          { data: { name: 't4_2', author: 'test_user', dest: 'u3', subject: 'S2', body: 'B2' } }
        ]
      }
    }),
    deleteDirectMessage: async (id) => {
      deletedMsgIds.push(id);
      return true;
    }
  };

  const fastRateLimiter = new AdaptiveRateLimiter({ baseDelayMs: 1, maxDelayMs: 5 });
  const cleaner = new RedditChatCleaner(mockApi, fastRateLimiter);

  // Mock modern channels
  cleaner.fetchModernChannels = async () => [
    { id: 'ch_1', channelUrl: 'ch_1', name: 'Chat 1', memberCount: 2, type: 'direct' },
    { id: 'ch_2', channelUrl: 'ch_2', name: 'Chat 2', memberCount: 3, type: 'group' }
  ];

  cleaner.leaveOrHideChannel = async (url) => {
    leftChannelUrls.push(url);
    return true;
  };

  const stats = await cleaner.nukeChats(
    { deletePMs: true, deleteModern: true },
    (event) => progressEvents.push(event)
  );

  assert.strictEqual(stats.pmsDeleted, 2);
  assert.strictEqual(stats.channelsLeft, 2);
  assert.strictEqual(deletedMsgIds.length, 2);
  assert.strictEqual(leftChannelUrls.length, 2);
  assert(progressEvents.some(e => e.stage === 'START'));
  assert(progressEvents.some(e => e.stage === 'COMPLETE'));
  console.log('✅ Chat nuke orchestration tests passed.');
}

// 5. Test Abort Signal Halting Execution
{
  const deletedMsgIds = [];
  const mockApi = {
    username: 'test_user',
    modhash: 'modhash_12345',
    fetchDirectMessages: async () => ({
      data: {
        children: [
          { data: { name: 't4_1', author: 'test_user', dest: 'u2', subject: 'S1', body: 'B1' } },
          { data: { name: 't4_2', author: 'test_user', dest: 'u3', subject: 'S2', body: 'B2' } },
          { data: { name: 't4_3', author: 'test_user', dest: 'u4', subject: 'S3', body: 'B3' } }
        ]
      }
    }),
    deleteDirectMessage: async (id) => {
      deletedMsgIds.push(id);
      return true;
    }
  };

  const fastRateLimiter = new AdaptiveRateLimiter({ baseDelayMs: 1, maxDelayMs: 5 });
  const cleaner = new RedditChatCleaner(mockApi, fastRateLimiter);

  let stepCount = 0;
  const stats = await cleaner.nukeChats(
    { deletePMs: true, deleteModern: false },
    () => {
      stepCount++;
      if (stepCount >= 3) {
        cleaner.abort();
      }
    }
  );

  assert(cleaner.abortRequested === true);
  assert(stats.pmsDeleted < 3, 'Should abort before all messages are deleted');
  console.log('✅ Chat nuke abort cancellation tests passed.');
}

// 6. Test Selective Privacy Clean-up & Filter Engine
{
  const now = Date.now();
  const ONE_DAY_MS = 86400 * 1000;

  const mockItems = [
    {
      id: 'ch_recent_friend',
      name: 'best_friend',
      type: 'direct',
      preview: 'See you tomorrow!',
      time: '11:14 AM' // very recent
    },
    {
      id: 'ch_old_convo',
      name: 'old_trader',
      type: 'direct',
      preview: 'Deal confirmed',
      createdUtc: Math.floor((now - 200 * ONE_DAY_MS) / 1000) // ~200 days old (>6 months)
    },
    {
      id: 'ch_deleted_user',
      name: '[deleted]',
      type: 'direct',
      preview: '[deleted] by user',
      createdUtc: Math.floor((now - 50 * ONE_DAY_MS) / 1000)
    },
    {
      id: 'pm_legacy_1',
      id_val: 't4_99',
      author: 'ghost',
      recipient: 'me',
      type: 'pm',
      subject: 'Old question',
      body: 'Hello from years ago',
      createdUtc: Math.floor((now - 400 * ONE_DAY_MS) / 1000) // > 1 year old
    },
    {
      id: 'ch_crypto_group',
      name: 'Crypto Chat Group',
      type: 'group',
      preview: 'Bitcoin hit high',
      createdUtc: Math.floor((now - 10 * ONE_DAY_MS) / 1000)
    }
  ];

  // Test parseChatTimestamp with various relative strings
  const ts2y = parseChatTimestamp({ time: '2y ago' });
  const age2y = (now - ts2y) / ONE_DAY_MS;
  assert(age2y >= 700 && age2y <= 740, `Expected ~730 days, got ${age2y}`);

  const ts6mo = parseChatTimestamp({ time: '6 mo. ago' });
  const age6mo = (now - ts6mo) / ONE_DAY_MS;
  assert(age6mo >= 170 && age6mo <= 190, `Expected ~180 days, got ${age6mo}`);

  const ts3w = parseChatTimestamp({ time: '3w ago' });
  const age3w = (now - ts3w) / ONE_DAY_MS;
  assert(age3w >= 20 && age3w <= 22, `Expected ~21 days, got ${age3w}`);

  const ts5d = parseChatTimestamp({ time: '5 d. ago' });
  const age5d = (now - ts5d) / ONE_DAY_MS;
  assert(age5d >= 4.9 && age5d <= 5.1, `Expected ~5 days, got ${age5d}`);

  // Test isDeletedAccount
  assert.strictEqual(isDeletedAccount(mockItems[2]), true);
  assert.strictEqual(isDeletedAccount(mockItems[3]), true); // author 'ghost'
  assert.strictEqual(isDeletedAccount(mockItems[0]), false);

  // Test that normal legacy PM is NOT considered deleted
  const normalPM = {
    id: 't4_abc',
    name: 'friendly_user',
    author: 'friendly_user',
    recipient: 'me',
    subject: 'Hello',
    body: 'How are you?',
    type: 'pm'
  };
  assert.strictEqual(isDeletedAccount(normalPM), false);

  // Test Search filter
  const searchResults = filterChatItems(mockItems, { search: 'Crypto' });
  assert.strictEqual(searchResults.length, 1);
  assert.strictEqual(searchResults[0].id, 'ch_crypto_group');

  // Test Date filter: older than 180 days (>6 months)
  const older180d = filterChatItems(mockItems, { dateRange: '180d' });
  assert.strictEqual(older180d.length, 2); // old_trader (200d) and pm_legacy_1 (400d)

  // Test Date filter: older than 7 days (> 7 Days Old)
  const item8d = { id: 'ch_8d', name: 'user_8d', time: '8 d. ago', type: 'direct' };
  const item2d = { id: 'ch_2d', name: 'user_2d', time: '2 d. ago', type: 'direct' };
  const filtered7d = filterChatItems([item8d, item2d], { dateRange: '7d' });
  assert.strictEqual(filtered7d.length, 1);
  assert.strictEqual(filtered7d[0].id, 'ch_8d');

  // Test Date filter on relative time strings: "6 mo. ago" item
  const itemWithRelTime = { id: 'ch_rel', name: 'rel_user', time: '6 mo. ago', type: 'direct' };
  const filteredRel = filterChatItems([itemWithRelTime, mockItems[0]], { dateRange: '90d' });
  assert.strictEqual(filteredRel.length, 1);
  assert.strictEqual(filteredRel[0].id, 'ch_rel');

  // Test Account Status filter: deleted accounts only
  const deletedOnly = filterChatItems(mockItems, { accountStatus: 'deleted' });
  assert.strictEqual(deletedOnly.length, 2);
  assert(deletedOnly.some(i => i.id === 'ch_deleted_user'));
  assert(deletedOnly.some(i => i.id === 'pm_legacy_1'));

  // Test Account Status filter: active accounts only
  const activeOnly = filterChatItems([...mockItems, normalPM], { accountStatus: 'active' });
  assert.strictEqual(activeOnly.length, 4); // mockItems[0], mockItems[1], mockItems[4], normalPM
  assert(activeOnly.some(i => i.id === 't4_abc'));

  // Test Channel Type filter: group only
  const groupsOnly = filterChatItems(mockItems, { channelType: 'group' });
  assert.strictEqual(groupsOnly.length, 1);
  assert.strictEqual(groupsOnly[0].id, 'ch_crypto_group');

  // Test Channel Type filter: pm only
  const pmsOnly = filterChatItems(mockItems, { channelType: 'pm' });
  assert.strictEqual(pmsOnly.length, 1);
  assert.strictEqual(pmsOnly[0].id, 'pm_legacy_1');

  console.log('✅ Selective Privacy Clean-up filter engine tests passed.');
}

// 7. Test isValidConversationName validator (Filtering out subreddits, comment counters, timestamps, buttons)
{
  // Should reject subreddits
  assert.strictEqual(isValidConversationName('r/memes'), false);
  assert.strictEqual(isValidConversationName('r/DesiSexTalk'), false);
  assert.strictEqual(isValidConversationName('u/r/BiharMedicos'), false);
  assert.strictEqual(isValidConversationName('r/GurgaonGoingWild'), false);

  // Should reject post comment count buttons
  assert.strictEqual(isValidConversationName('33 comments'), false);
  assert.strictEqual(isValidConversationName('8 comments'), false);
  assert.strictEqual(isValidConversationName('16 comments'), false);
  assert.strictEqual(isValidConversationName('27 comments'), false);
  assert.strictEqual(isValidConversationName('1 comment'), false);

  // Should reject video player timestamps
  assert.strictEqual(isValidConversationName('0:10'), false);
  assert.strictEqual(isValidConversationName('1:23'), false);
  assert.strictEqual(isValidConversationName('10:45'), false);

  // Should reject UI controls & buttons
  assert.strictEqual(isValidConversationName('Reddit Pro'), false);
  assert.strictEqual(isValidConversationName('Share'), false);
  assert.strictEqual(isValidConversationName('Chats'), false);
  assert.strictEqual(isValidConversationName('Settings'), false);
  assert.strictEqual(isValidConversationName('Home'), false);
  assert.strictEqual(isValidConversationName('Explore'), false);
  assert.strictEqual(isValidConversationName('Delete my messages'), false);

  // Should accept valid chat usernames
  assert.strictEqual(isValidConversationName('Pshyce11'), true);
  assert.strictEqual(isValidConversationName('Akki512bakki'), true);
  assert.strictEqual(isValidConversationName('Informal_Teach7014'), true);
  assert.strictEqual(isValidConversationName('Appropriate_Bass_454'), true);
  assert.strictEqual(isValidConversationName('Subject-Drink-6607'), true);
  assert.strictEqual(isValidConversationName('u/Pshyce11'), true);

  console.log('✅ isValidConversationName validator tests passed.');
}

console.log('🎉 ALL CHAT & DM TESTS PASSED!');
