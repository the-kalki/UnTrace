/**
 * Bulk Reddit Nuke & Privacy Cleaner - Destructive Nuker Engine
 * Overwrites target comments and posts with random gibberish before permanent deletion
 */

export class HistoryNuker {
  constructor(apiClient, rateLimiter) {
    this.api = apiClient;
    this.rateLimiter = rateLimiter;
    this.isPaused = false;
    this.pausePromiseResolve = null;
  }

  /**
   * Generates cryptographically secure random alphanumeric gibberish
   */
  generateGibberish(targetLength = 64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const array = new Uint8Array(targetLength);
    crypto.getRandomValues(array);
    let str = '';
    for (let i = 0; i < targetLength; i++) {
      str += chars[array[i] % chars.length];
    }
    return str;
  }

  /**
   * Toggles pause state
   */
  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
  }

  /**
   * Internal check to pause execution if requested
   */
  async checkPause(signal = null) {
    if (!this.isPaused) return;

    if (signal && signal.aborted) throw new DOMException('Nuker aborted during pause', 'AbortError');

    await new Promise((resolve, reject) => {
      this.pausePromiseResolve = resolve;
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Nuker aborted during pause', 'AbortError'));
        }, { once: true });
      }
    });
  }

  /**
   * Executes the 2-step Overwrite & Delete on a list of items
   * @param {Array} items Target items to nuke
   * @param {AbortSignal} signal AbortController signal
   * @param {Function} onProgress Progress callback
   */
  async nukeBatch(items, signal = null, onProgress = null) {
    let overwrittenCount = 0;
    let deletedCount = 0;
    const total = items.length;

    for (let i = 0; i < items.length; i++) {
      if (signal && signal.aborted) throw new DOMException('Nuker aborted', 'AbortError');
      await this.checkPause(signal);

      const item = items[i];
      const thingId = item.data?.name || item.id;
      const isComment = item.kind === 't1' || Boolean(item.data?.parent_id);
      const itemType = isComment ? 'Comment' : 'Post';
      const subreddit = item.data?.subreddit ? `r/${item.data.subreddit}` : '';

      // Stage 1: Overwrite with Random Gibberish
      const gibberish = this.generateGibberish(48);
      let editSuccess = false;

      while (!editSuccess) {
        if (signal && signal.aborted) throw new DOMException('Nuker aborted', 'AbortError');
        await this.checkPause(signal);

        try {
          if (onProgress) {
            onProgress({
              stage: 'OVERWRITING',
              index: i + 1,
              total,
              thingId,
              itemType,
              subreddit,
              message: `[${i + 1}/${total}] Overwriting ${itemType} ${thingId} (${subreddit})...`
            });
          }

          await this.api.editUserText(thingId, gibberish);
          editSuccess = true;
          overwrittenCount++;
          this.rateLimiter.resetBackoff();
        } catch (err) {
          if (err.name === 'RateLimitError') {
            await this.rateLimiter.triggerBackoff(err.retryAfter, signal);
          } else {
            console.warn(`[Nuker] Failed to overwrite ${thingId}:`, err.message);
            // Some items (like link posts without selftext) cannot be edited; proceed to delete
            break;
          }
        }
      }

      // Brief jittered pacing
      await this.rateLimiter.waitPace(signal);

      // Stage 2: Permanent Deletion
      let deleteSuccess = false;
      while (!deleteSuccess) {
        if (signal && signal.aborted) throw new DOMException('Nuker aborted', 'AbortError');
        await this.checkPause(signal);

        try {
          if (onProgress) {
            onProgress({
              stage: 'DELETING',
              index: i + 1,
              total,
              thingId,
              itemType,
              subreddit,
              message: `[${i + 1}/${total}] Permanently deleting ${itemType} ${thingId}...`
            });
          }

          await this.api.deleteItem(thingId);
          deleteSuccess = true;
          deletedCount++;
          this.rateLimiter.resetBackoff();
        } catch (err) {
          if (err.name === 'RateLimitError') {
            await this.rateLimiter.triggerBackoff(err.retryAfter, signal);
          } else {
            console.error(`[Nuker] Failed to delete ${thingId}:`, err.message);
            break;
          }
        }
      }

      if (onProgress) {
        onProgress({
          stage: 'ITEM_COMPLETE',
          index: i + 1,
          total,
          overwrittenCount,
          deletedCount,
          thingId,
          itemType,
          message: `[${i + 1}/${total}] Purged ${itemType} ${thingId}`
        });
      }

      await this.rateLimiter.waitPace(signal);
    }

    return { total, overwrittenCount, deletedCount };
  }
}
