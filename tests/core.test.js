/**
 * Unit Test Suite for Core Engine
 */

import assert from 'node:assert';
import { FilterEngine } from '../src/core/filters.js';
import { HistoryNuker } from '../src/core/nuker.js';
import { HistoryExporter } from '../src/core/exporter.js';
import { AdaptiveRateLimiter } from '../src/core/rate-limiter.js';

console.log('🧪 Starting Core Test Suite...');

// 1. Test FilterEngine
{
  const filter = new FilterEngine({
    targetType: 'all',
    preserveSaved: true,
    preserveKarmaAbove: 50,
    subreddits: ['funny', 'memes'],
    subredditMode: 'blacklist'
  });

  const normalComment = {
    kind: 't1',
    data: {
      name: 't1_abc',
      score: 10,
      saved: false,
      subreddit: 'askreddit',
      created_utc: Date.now() / 1000 - 86400 * 40
    }
  };

  const highKarmaComment = {
    kind: 't1',
    data: {
      name: 't1_def',
      score: 150,
      saved: false,
      subreddit: 'askreddit',
      created_utc: Date.now() / 1000 - 86400 * 40
    }
  };

  const savedComment = {
    kind: 't1',
    data: {
      name: 't1_ghi',
      score: 5,
      saved: true,
      subreddit: 'askreddit',
      created_utc: Date.now() / 1000 - 86400 * 40
    }
  };

  const blacklistedSubredditComment = {
    kind: 't1',
    data: {
      name: 't1_jkl',
      score: 5,
      saved: false,
      subreddit: 'funny',
      created_utc: Date.now() / 1000 - 86400 * 40
    }
  };

  assert.strictEqual(filter.shouldNuke(normalComment), true, 'Normal comment should be nuked');
  assert.strictEqual(filter.shouldNuke(highKarmaComment), false, 'High karma comment should be preserved');
  assert.strictEqual(filter.shouldNuke(savedComment), false, 'Saved comment should be preserved');
  assert.strictEqual(filter.shouldNuke(blacklistedSubredditComment), false, 'Blacklisted subreddit should be preserved');

  console.log('✅ FilterEngine tests passed.');
}

// 2. Test HistoryNuker Gibberish Generator
{
  const nuker = new HistoryNuker(null, null);
  const gibberish1 = nuker.generateGibberish(48);
  const gibberish2 = nuker.generateGibberish(48);

  assert.strictEqual(gibberish1.length, 48, 'Gibberish length should be 48');
  assert.strictEqual(gibberish2.length, 48, 'Gibberish length should be 48');
  assert.notStrictEqual(gibberish1, gibberish2, 'Random gibberish strings must not be equal');

  console.log('✅ HistoryNuker gibberish generator tests passed.');
}

// 3. Test HistoryExporter
{
  const mockComments = [
    { data: { name: 't1_1', subreddit: 'news', score: 10, body: 'test body 1', created_utc: 1700000000 } }
  ];
  const mockPosts = [
    { data: { name: 't3_1', subreddit: 'tech', score: 25, title: 'test post 1', selftext: 'test selftext', created_utc: 1700000000 } }
  ];

  const backup = HistoryExporter.compileBackup('testuser', mockComments, mockPosts);
  assert.strictEqual(backup.username, 'testuser');
  assert.strictEqual(backup.metadata.totalComments, 1);
  assert.strictEqual(backup.metadata.totalPosts, 1);
  assert.strictEqual(backup.metadata.totalItems, 2);
  assert.strictEqual(backup.comments[0].body, 'test body 1');

  console.log('✅ HistoryExporter compilation tests passed.');
}

// 4. Test AdaptiveRateLimiter
{
  const limiter = new AdaptiveRateLimiter({ baseDelayMs: 600, jitterMs: 200 });
  const pace = limiter.getNextPaceMs();
  assert(pace >= 600 && pace <= 800, `Pace should be between 600 and 800 ms, got ${pace}`);

  console.log('✅ AdaptiveRateLimiter tests passed.');
}

console.log('🎉 ALL UNIT TESTS PASSED!');
