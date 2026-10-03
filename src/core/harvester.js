/**
 * Bulk Reddit Nuke & Privacy Cleaner - History Harvester
 * Recursively paginates through comments and submissions
 */

export class HistoryHarvester {
  constructor(apiClient, rateLimiter) {
    this.api = apiClient;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Harvests all user comments
   */
  async harvestComments(signal = null, onProgress = null) {
    const comments = [];
    let after = null;
    let page = 1;

    while (true) {
      if (signal && signal.aborted) throw new DOMException('Harvester aborted', 'AbortError');

      if (onProgress) {
        onProgress({
          type: 'HARVESTING_COMMENTS',
          page,
          count: comments.length,
          message: `Harvesting comments (Page ${page}, ${comments.length} found)...`
        });
      }

      let res;
      try {
        res = await this.api.fetchComments(after, 100);
      } catch (err) {
        if (err.name === 'RateLimitError') {
          await this.rateLimiter.triggerBackoff(err.retryAfter, signal);
          continue; // Retry current page
        }
        throw err;
      }

      const children = res.data?.children || [];
      if (children.length === 0) break;

      comments.push(...children);
      after = res.data?.after;
      page++;

      if (!after) break;
      await this.rateLimiter.waitPace(signal);
    }

    return comments;
  }

  /**
   * Harvests all user submissions/posts
   */
  async harvestSubmissions(signal = null, onProgress = null) {
    const posts = [];
    let after = null;
    let page = 1;

    while (true) {
      if (signal && signal.aborted) throw new DOMException('Harvester aborted', 'AbortError');

      if (onProgress) {
        onProgress({
          type: 'HARVESTING_POSTS',
          page,
          count: posts.length,
          message: `Harvesting posts (Page ${page}, ${posts.length} found)...`
        });
      }

      let res;
      try {
        res = await this.api.fetchSubmissions(after, 100);
      } catch (err) {
        if (err.name === 'RateLimitError') {
          await this.rateLimiter.triggerBackoff(err.retryAfter, signal);
          continue; // Retry current page
        }
        throw err;
      }

      const children = res.data?.children || [];
      if (children.length === 0) break;

      posts.push(...children);
      after = res.data?.after;
      page++;

      if (!after) break;
      await this.rateLimiter.waitPace(signal);
    }

    return posts;
  }

  /**
   * Harvests full history: both comments and submissions
   */
  async harvestAll(signal = null, onProgress = null) {
    const comments = await this.harvestComments(signal, onProgress);
    const posts = await this.harvestSubmissions(signal, onProgress);
    return { comments, posts };
  }
}
