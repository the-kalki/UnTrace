/**
 * Bulk Reddit Nuke & Privacy Cleaner - Experimental Reddit Chat Cleaner
 * Interacts with Reddit's GraphQL Chat API (Beta / Experimental)
 */

export class RedditChatCleaner {
  constructor(apiClient) {
    this.api = apiClient;
    this.gqlUrl = 'https://gql.reddit.com';
  }

  /**
   * Discovers current user chat bearer token or session cookie
   */
  async getChatAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Modhash': this.api.modhash || ''
    };
  }

  /**
   * Fetches active chat threads (Experimental)
   */
  async fetchConversations() {
    try {
      const headers = await this.getChatAuthHeaders();
      const query = `
        query UserChatChannels {
          identity {
            id
            name
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
      return json.data || {};
    } catch (err) {
      console.warn('[ChatCleaner] Failed to query GraphQL:', err.message);
      throw new Error(`Chat query failed: ${err.message}. Reddit Chat may require direct tab interaction.`);
    }
  }

  /**
   * Delete specific chat message via GraphQL mutation (Experimental)
   */
  async deleteMessage(messageId) {
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
      throw new Error(`Delete chat message failed: HTTP ${res.status}`);
    }

    return await res.json();
  }
}
