/**
 * Bulk Reddit Nuke & Privacy Cleaner - Reddit API Client
 * Manages Reddit Internal REST and GraphQL communications
 */

export class RedditApiClient {
  constructor(baseUrl = 'https://www.reddit.com') {
    this.baseUrl = baseUrl;
    this.modhash = '';
    this.username = '';
  }

  setCredentials(username, modhash) {
    this.username = username;
    this.modhash = modhash;
  }

  setChatToken(token) {
    this.chatToken = token;
  }

  getChatToken() {
    return this.chatToken || null;
  }

  /**
   * Fetches user private messages / direct messages
   */
  async fetchDirectMessages(limit = 100, after = null) {
    let url = `${this.baseUrl}/message/messages.json?limit=${limit}`;
    if (after) url += `&after=${after}`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Modhash': this.modhash || ''
      }
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new RateLimitError('Rate limit exceeded (HTTP 429)', res.headers.get('Retry-After'));
      }
      throw new Error(`Failed to fetch messages: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Deletes a legacy direct message / PM
   * @param {string} fullname ID of message (e.g. t4_xxxx)
   */
  async deleteDirectMessage(fullname) {
    const url = `${this.baseUrl}/api/del_msg`;
    const params = new URLSearchParams({
      id: fullname,
      uh: this.modhash
    });

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Modhash': this.modhash,
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new RateLimitError('Rate limit exceeded (HTTP 429)', res.headers.get('Retry-After'));
      }
      throw new Error(`Delete direct message failed: HTTP ${res.status}`);
    }

    return true;
  }

  /**
   * Fetches current authenticated user details and modhash
   */
  async getMe() {
    const url = `${this.baseUrl}/api/me.json`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch user session: HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json.data || !json.data.name) {
      throw new Error('User is not authenticated. Please log in to Reddit.');
    }

    this.username = json.data.name;
    this.modhash = json.data.modhash || this.modhash;

    return {
      username: json.data.name,
      id: json.data.id,
      modhash: this.modhash,
      totalKarma: json.data.total_karma || 0,
      createdUtc: json.data.created_utc
    };
  }

  /**
   * Fetches user comments with pagination
   */
  async fetchComments(after = null, limit = 100) {
    if (!this.username) throw new Error('Username required');
    let url = `${this.baseUrl}/user/${this.username}/comments.json?limit=${limit}&sort=new`;
    if (after) url += `&after=${after}`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch comments: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Fetches user submissions/posts with pagination
   */
  async fetchSubmissions(after = null, limit = 100) {
    if (!this.username) throw new Error('Username required');
    let url = `${this.baseUrl}/user/${this.username}/submitted.json?limit=${limit}&sort=new`;
    if (after) url += `&after=${after}`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch submissions: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Stage 1: Overwrite post or comment body with gibberish
   * @param {string} thingId Fullname identifier (e.g. t1_xxxx or t3_xxxx)
   * @param {string} text The replacement/gibberish body
   */
  async editUserText(thingId, text) {
    const url = `${this.baseUrl}/api/editusertext`;
    const params = new URLSearchParams({
      api_type: 'json',
      thing_id: thingId,
      text: text,
      uh: this.modhash
    });

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Modhash': this.modhash,
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new RateLimitError('Rate limit exceeded (HTTP 429)', res.headers.get('Retry-After'));
      }
      throw new Error(`Edit failed for ${thingId}: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.json && data.json.errors && data.json.errors.length > 0) {
      throw new Error(`Edit error: ${JSON.stringify(data.json.errors)}`);
    }

    return data;
  }

  /**
   * Stage 2: Permanently delete post or comment
   * @param {string} id Fullname identifier (e.g. t1_xxxx or t3_xxxx)
   */
  async deleteItem(id) {
    const url = `${this.baseUrl}/api/del`;
    const params = new URLSearchParams({
      id: id,
      executed: 'deleted',
      uh: this.modhash
    });

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Modhash': this.modhash,
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new RateLimitError('Rate limit exceeded (HTTP 429)', res.headers.get('Retry-After'));
      }
      throw new Error(`Delete failed for ${id}: HTTP ${res.status}`);
    }

    return true;
  }
}

export class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter ? parseInt(retryAfter, 10) : 5;
  }
}
