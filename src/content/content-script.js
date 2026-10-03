/**
 * Bulk Reddit Nuke & Privacy Cleaner - Content Script
 * Injected into Reddit domains to bridge authentication, modhash, and DOM signals
 */

(function () {
  console.log('[Reddit Nuke] Content Script initialized on:', window.location.hostname);

  /**
   * Harvests session data from Reddit's environment
   */
  async function harvestRedditSession() {
    try {
      // 1. Attempt to fetch /api/me.json via page origin with cookies
      const response = await fetch('https://www.reddit.com/api/me.json', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.data) {
          const modhash = data.data.modhash || extractModhashFromDOM();
          const sessionData = {
            isLoggedIn: true,
            username: data.data.name,
            id: data.data.id,
            modhash: modhash,
            totalKarma: data.data.total_karma || 0,
            createdUtc: data.data.created_utc,
            timestamp: Date.now()
          };

          // Store in extension storage
          await chrome.storage.local.set({ redditSession: sessionData });
          return sessionData;
        }
      }
    } catch (err) {
      console.warn('[Reddit Nuke] /api/me.json fetch attempt:', err.message);
    }

    // Fallback: Check DOM for modhash and logged-in cues
    const modhash = extractModhashFromDOM();
    const username = extractUsernameFromDOM();

    const fallbackSession = {
      isLoggedIn: Boolean(username || modhash),
      username: username || 'Unknown',
      modhash: modhash || '',
      timestamp: Date.now()
    };

    if (fallbackSession.isLoggedIn) {
      await chrome.storage.local.set({ redditSession: fallbackSession });
    }

    return fallbackSession;
  }

  /**
   * Helper to extract CSRF modhash from common Reddit DOM structures
   */
  function extractModhashFromDOM() {
    // Old Reddit hidden input
    const uhInput = document.querySelector('input[name="uh"]');
    if (uhInput && uhInput.value) return uhInput.value;

    // Window initial state
    try {
      if (window.___INITIAL_STATE___ && window.___INITIAL_STATE___.user) {
        return window.___INITIAL_STATE___.user.session?.modhash || '';
      }
    } catch (_) {}

    return '';
  }

  /**
   * Helper to extract username from Reddit DOM
   */
  function extractUsernameFromDOM() {
    // Shreddit / New Reddit user element
    const shredditUser = document.querySelector('shreddit-app')?.getAttribute('current-user');
    if (shredditUser) return shredditUser;

    // Old Reddit user link
    const oldRedditUser = document.querySelector('.user a');
    if (oldRedditUser && oldRedditUser.textContent && !oldRedditUser.textContent.includes('login')) {
      return oldRedditUser.textContent.trim();
    }

    // New Reddit header username
    const profileLink = document.querySelector('a[href^="/user/"]');
    if (profileLink) {
      const match = profileLink.getAttribute('href').match(/\/user\/([^\/]+)/);
      if (match) return match[1];
    }

    return null;
  }

  // Auto-harvest on script execution
  harvestRedditSession().catch((err) => console.error('[Reddit Nuke] Auto-harvest failed:', err));

  // Listen for queries from Side Panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_SESSION') {
      harvestRedditSession()
        .then((session) => sendResponse({ success: true, session }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open
    }

    if (message.type === 'EXECUTE_PAGE_FETCH') {
      const { url, options } = message.payload;
      fetch(url, { ...options, credentials: 'include' })
        .then(async (res) => {
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          sendResponse({
            success: res.ok,
            status: res.status,
            data: json || text
          });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
  });
})();
