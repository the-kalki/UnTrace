/**
 * UnTrace - Reddit Chat DOM Automation Bridge
 * Injected on reddit.com/chat to automate discovery, message deletion, and channel leaving
 */

(function () {
  if (!window.location.pathname.startsWith('/chat')) {
    return;
  }

  console.log('[UnTrace] Chat Bridge active on Reddit Chat interface.');

  let isPurging = false;
  let abortPurge = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CHAT_DOM') {
      try {
        const channels = scanChannelsFromDOM();
        const activeConversation = getActiveConversationInfo();
        const messageCount = countVisibleMessages();

        sendResponse({
          success: true,
          url: window.location.href,
          channels,
          activeConversation,
          messageCount
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'ABORT_CHAT_PURGE') {
      abortPurge = true;
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'PURGE_VISIBLE_CHAT') {
      if (isPurging) {
        sendResponse({ success: false, error: 'Purge already in progress' });
        return true;
      }

      isPurging = true;
      abortPurge = false;

      (async () => {
        try {
          const result = await executeChatPurgeLoop();
          isPurging = false;
          sendResponse({ success: true, ...result });
        } catch (err) {
          isPurging = false;
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (message.type === 'LEAVE_CURRENT_CHAT') {
      (async () => {
        try {
          const left = await automateLeaveCurrentChat();
          sendResponse({ success: left });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }
  });

  /**
   * Scans sidebar channel links and active threads
   */
  function scanChannelsFromDOM() {
    const channelItems = [];
    const elements = document.querySelectorAll('a[href*="/chat/channel/"], [data-testid="channel-item"], [role="listitem"]');

    elements.forEach((el, index) => {
      const href = el.getAttribute('href') || '';
      const text = el.innerText || el.textContent || '';
      const name = text.split('\n')[0]?.trim() || `Channel ${index + 1}`;

      if (name && name.length < 60) {
        channelItems.push({
          id: href || `ch_${index}`,
          name: name,
          url: href ? `https://www.reddit.com${href}` : null
        });
      }
    });

    return channelItems;
  }

  /**
   * Identifies currently open chat conversation metadata
   */
  function getActiveConversationInfo() {
    const headerTitle = document.querySelector('header h1, [data-testid="chat-header-title"], .chat-header-name');
    return {
      title: headerTitle ? headerTitle.textContent.trim() : 'Active Chat',
      url: window.location.href
    };
  }

  /**
   * Counts visible messages inside the active chat thread
   */
  function countVisibleMessages() {
    const messages = document.querySelectorAll(
      '[data-testid="message-content"], .message-body, [role="row"], [data-testid="chat-message"]'
    );
    return messages.length;
  }

  /**
   * Scrolls chat view to load older messages
   */
  async function scrollUpChatContainer() {
    const scrollContainer = document.querySelector(
      '[data-testid="virtuoso-scroller"], [data-testid="message-scroller"], .messages-scroll-container'
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      await sleep(1000);
    }
  }

  /**
   * Purges user messages in the active chat view with human-like delays
   */
  async function executeChatPurgeLoop(maxRounds = 30) {
    let totalDeleted = 0;

    for (let round = 0; round < maxRounds; round++) {
      if (abortPurge) break;

      // Find delete buttons or 3-dots menus
      const actionMenus = document.querySelectorAll(
        '[aria-label="More message options"], [aria-label="More options"], button[title="More"]'
      );

      let roundDeletions = 0;

      for (const menuBtn of actionMenus) {
        if (abortPurge) break;

        try {
          menuBtn.click();
          await sleep(350);

          // Find "Delete" in popup menu
          const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], button, div'));
          const deleteOption = menuItems.find(item => {
            const text = (item.textContent || '').trim().toLowerCase();
            return text === 'delete message' || text === 'delete' || text.startsWith('delete for');
          });

          if (deleteOption) {
            deleteOption.click();
            await sleep(400);

            // Confirm delete modal button
            const confirmButtons = Array.from(document.querySelectorAll('[role="dialog"] button, .modal button'));
            const confirmBtn = confirmButtons.find(btn => {
              const text = (btn.textContent || '').trim().toLowerCase();
              return text.includes('delete') || text.includes('confirm') || text === 'yes';
            });

            if (confirmBtn) {
              confirmBtn.click();
              totalDeleted++;
              roundDeletions++;
              await sleep(650);
            }
          } else {
            // Close menu if delete not available (e.g. other user's message)
            document.body.click();
            await sleep(200);
          }
        } catch (_) {
          document.body.click();
        }
      }

      // If no deletions found in current view, attempt scrolling up to fetch earlier messages
      if (roundDeletions === 0) {
        await scrollUpChatContainer();
        const remaining = countVisibleMessages();
        if (remaining === 0) break; // Finished
      }
    }

    return { totalDeleted, aborted: abortPurge };
  }

  /**
   * Automates leaving the current conversation
   */
  async function automateLeaveCurrentChat() {
    // Look for channel settings or leave button
    const settingsBtn = document.querySelector(
      '[aria-label="Channel settings"], [aria-label="Conversation details"], [data-testid="chat-info-btn"]'
    );

    if (settingsBtn) {
      settingsBtn.click();
      await sleep(500);

      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const leaveBtn = buttons.find(b => {
        const text = (b.textContent || '').trim().toLowerCase();
        return text.includes('leave chat') || text.includes('leave conversation') || text.includes('hide chat');
      });

      if (leaveBtn) {
        leaveBtn.click();
        await sleep(500);

        // Confirm modal if prompted
        const confirmBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => {
          const t = (b.textContent || '').toLowerCase();
          return t.includes('leave') || t.includes('confirm') || t.includes('yes');
        });

        if (confirmBtn) {
          confirmBtn.click();
          await sleep(500);
        }
        return true;
      }
    }

    return false;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
