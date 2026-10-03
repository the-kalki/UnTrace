/**
 * Bulk Reddit Nuke & Privacy Cleaner - Adaptive Rate Limiter
 * Provides jittered pacing and exponential backoff for HTTP 429 prevention
 */

export class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.baseDelayMs = options.baseDelayMs || 800;
    this.jitterMs = options.jitterMs || 350;
    this.currentBackoffSeconds = 0;
    this.maxBackoffSeconds = 60;
    this.onStatusChange = options.onStatusChange || null;
  }

  /**
   * Generates a dynamic wait time with jitter
   */
  getNextPaceMs() {
    const jitter = Math.floor(Math.random() * this.jitterMs);
    return this.baseDelayMs + jitter;
  }

  /**
   * Waits for standard pacing interval, checking abort controller
   */
  async waitPace(signal = null) {
    const ms = this.getNextPaceMs();
    await this.sleep(ms, signal);
  }

  /**
   * Triggers exponential backoff when HTTP 429 is encountered
   * @param {number} suggestedSeconds Retry-After header value if available
   */
  async triggerBackoff(suggestedSeconds = null, signal = null) {
    if (suggestedSeconds && suggestedSeconds > 0) {
      this.currentBackoffSeconds = Math.min(suggestedSeconds, this.maxBackoffSeconds);
    } else if (this.currentBackoffSeconds === 0) {
      this.currentBackoffSeconds = 5;
    } else {
      this.currentBackoffSeconds = Math.min(this.currentBackoffSeconds * 2, this.maxBackoffSeconds);
    }

    if (this.onStatusChange) {
      this.onStatusChange({
        type: 'BACKOFF',
        seconds: this.currentBackoffSeconds,
        message: `Rate limit hit (429). Pacing backoff for ${this.currentBackoffSeconds}s...`
      });
    }

    // Wait second-by-second so user can abort or see remaining countdown
    for (let sec = this.currentBackoffSeconds; sec > 0; sec--) {
      if (signal && signal.aborted) break;
      if (this.onStatusChange) {
        this.onStatusChange({
          type: 'COUNTDOWN',
          remainingSeconds: sec
        });
      }
      await this.sleep(1000, signal);
    }

    if (this.onStatusChange) {
      this.onStatusChange({
        type: 'RESUMED',
        message: 'Resuming operations...'
      });
    }
  }

  /**
   * Resets backoff counter after a sequence of successful calls
   */
  resetBackoff() {
    this.currentBackoffSeconds = 0;
  }

  recordSuccess() {
    this.resetBackoff();
  }

  async throttle(signal = null) {
    return await this.waitPace(signal);
  }

  async handle429(suggestedSeconds = null, signal = null) {
    return await this.triggerBackoff(suggestedSeconds, signal);
  }

  /**
   * Sleep helper with AbortSignal support
   */
  sleep(ms, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        return reject(new DOMException('Operation aborted', 'AbortError'));
      }

      const timer = setTimeout(() => {
        resolve();
      }, ms);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Operation aborted', 'AbortError'));
        }, { once: true });
      }
    });
  }
}
