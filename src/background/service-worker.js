/**
 * Bulk Reddit Nuke & Privacy Cleaner - Background Service Worker
 * Manifest V3 Ephemeral Service Worker
 */

// Configure side panel to open on action toolbar click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[SW] Error setting panel behavior:', err));

// On Installed Setup
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SW] Extension installed or updated:', details.reason);

  const existingConfig = await chrome.storage.local.get(['filters', 'config', 'stats']);

  const defaultConfig = {
    delayMs: 800,
    jitterMs: 400,
    maxRetries: 3,
    maskStyle: 'gibberish'
  };

  const defaultFilters = {
    dateRange: 'all', // 'all', '1m', '6m', '1y'
    minKarma: null,
    preserveSaved: true,
    subreddits: [] // Whitelist or empty for all
  };

  const defaultStats = {
    totalHarvested: 0,
    totalOverwritten: 0,
    totalDeleted: 0,
    lastRunTimestamp: null
  };

  await chrome.storage.local.set({
    config: existingConfig.config || defaultConfig,
    filters: existingConfig.filters || defaultFilters,
    stats: existingConfig.stats || defaultStats,
    nukeState: {
      isRunning: false,
      isPaused: false,
      currentStep: 'idle',
      progress: { current: 0, total: 0 }
    }
  });
});

// Runtime Message Passing Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return false;
  }

  if (message.type === 'GET_SESSION_STATUS') {
    (async () => {
      try {
        const state = await chrome.storage.local.get(['nukeState', 'redditSession', 'stats']);
        sendResponse({ success: true, data: state });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.type === 'UPDATE_SESSION') {
    (async () => {
      try {
        await chrome.storage.local.set({ redditSession: message.payload });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
