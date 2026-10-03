/**
 * Bulk Reddit Nuke & Privacy Cleaner - Chat Bridge Content Script (Experimental)
 * Facilitates DOM-level actions inside reddit.com/chat when GraphQL direct mutations require UI interaction
 */

(function () {
  if (!window.location.pathname.startsWith('/chat')) {
    return;
  }

  console.log('[Reddit Nuke] Chat Bridge active on Reddit Chat interface.');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CHAT_DOM') {
      const chatMessages = document.querySelectorAll('[data-testid="message-content"], .message-body');
      sendResponse({
        success: true,
        count: chatMessages.length,
        url: window.location.href
      });
      return true;
    }

    if (message.type === 'PURGE_VISIBLE_CHAT') {
      // Experimental DOM automation to delete visible user messages
      (async () => {
        try {
          const deleteButtons = document.querySelectorAll('[aria-label="Delete message"], button[title="Delete"]');
          let deleted = 0;

          for (const btn of deleteButtons) {
            btn.click();
            await new Promise(r => setTimeout(r, 400));
            // Confirm button
            const confirmBtn = document.querySelector('button[type="submit"], .confirm-delete-btn');
            if (confirmBtn) {
              confirmBtn.click();
              deleted++;
              await new Promise(r => setTimeout(r, 600));
            }
          }

          sendResponse({ success: true, deleted });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }
  });
})();
