/**
 * Bulk Reddit Nuke & Privacy Cleaner - Filter Engine
 * Evaluates whether a post or comment should be targeted for deletion
 */

export class FilterEngine {
  constructor(filters = {}) {
    this.filters = {
      targetType: 'all',          // 'all', 'comments', 'posts'
      dateRange: 'all',           // 'all', '1m', '6m', '1y'
      preserveKarmaAbove: null,   // integer or null
      preserveSaved: true,        // boolean
      preserveGilded: false,      // boolean
      subreddits: [],             // array of subreddit names (lowercase)
      subredditMode: 'blacklist', // 'blacklist' (exclude) or 'whitelist' (only these)
      ...filters
    };
  }

  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
  }

  /**
   * Evaluates if a Reddit item (comment/post) matches the filter criteria
   * @param {Object} item - Reddit API Thing object (item.data)
   * @returns {boolean} true if item should be nuked, false if preserved
   */
  shouldNuke(item) {
    const data = item.data;
    if (!data) return false;

    // 1. Target Type Check
    const isComment = item.kind === 't1' || Boolean(data.parent_id);
    const isPost = item.kind === 't3' || Boolean(data.title);

    if (this.filters.targetType === 'comments' && !isComment) return false;
    if (this.filters.targetType === 'posts' && !isPost) return false;

    // 2. Saved Items Check
    if (this.filters.preserveSaved && data.saved) {
      return false;
    }

    // 3. Gilded Check
    if (this.filters.preserveGilded && (data.gilded > 0 || (data.total_awards_received && data.total_awards_received > 0))) {
      return false;
    }

    // 4. Karma Score Threshold
    if (this.filters.preserveKarmaAbove !== null && this.filters.preserveKarmaAbove !== undefined) {
      const score = Number(data.score) || 0;
      if (score >= this.filters.preserveKarmaAbove) {
        return false;
      }
    }

    // 5. Date Range Check (created_utc in seconds)
    if (this.filters.dateRange && this.filters.dateRange !== 'all') {
      const itemAgeSeconds = (Date.now() / 1000) - data.created_utc;
      const oneDay = 86400;

      let thresholdSeconds = 0;
      if (this.filters.dateRange === '1m') thresholdSeconds = 30 * oneDay;
      else if (this.filters.dateRange === '6m') thresholdSeconds = 180 * oneDay;
      else if (this.filters.dateRange === '1y') thresholdSeconds = 365 * oneDay;

      // Only nuke if older than threshold
      if (itemAgeSeconds < thresholdSeconds) {
        return false;
      }
    }

    // 6. Subreddit Whitelist/Blacklist
    if (this.filters.subreddits && this.filters.subreddits.length > 0) {
      const itemSubreddit = (data.subreddit || '').toLowerCase();
      const subs = this.filters.subreddits.map(s => s.toLowerCase().trim().replace(/^r\//, ''));

      if (this.filters.subredditMode === 'whitelist') {
        // Must be in list
        if (!subs.includes(itemSubreddit)) return false;
      } else {
        // Blacklist: must NOT be in list
        if (subs.includes(itemSubreddit)) return false;
      }
    }

    return true;
  }

  /**
   * Filters an array of harvested items
   */
  filterBatch(items) {
    return items.filter(item => this.shouldNuke(item));
  }
}
