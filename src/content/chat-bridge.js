/**
 * UnTrace - Reddit Chat DOM Automation Bridge
 * Injected across Reddit domains (*://*.reddit.com/*) to automate discovery,
 * message deletion, and conversation purging in both full-page chat and the floating chat dock.
 */

(function () {
  console.log('[UnTrace] Chat Bridge content script loaded on:', window.location.href);

  let isPurging = false;
  let abortPurge = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CHAT_DOM') {
      try {
        const channels = scanChannelsFromDOM();
        const activeConversation = getActiveConversationInfo();
        const messageCount = countVisibleMessages();
        const isChatOpen = isChatWidgetVisible();

        sendResponse({
          success: true,
          url: window.location.href,
          isChatOpen,
          channels,
          activeConversation,
          messageCount
        });
      } catch (err) {
        console.error('[UnTrace Chat Bridge] Error scanning chat DOM:', err);
        sendResponse({ success: false, error: err.message, channels: [] });
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
          const result = await executeChatPurgeLoop(message.username);
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
   * Checks if Reddit Chat (dock or full page) is present on screen
   */
  function isChatWidgetVisible() {
    if (window.location.pathname.startsWith('/chat')) return true;
    const chatElements = document.querySelectorAll(
      '[role="dialog"], aside, [aria-label*="chat" i], div[class*="Chat"], [data-testid*="chat"]'
    );
    return chatElements.length > 0;
  }

  /**
   * Deep scan of channels/conversations across Reddit Chat DOM
   */
  function scanChannelsFromDOM() {
    const channelItems = [];
    const seenIds = new Set();

    // 1. Scan links matching chat patterns
    const links = document.querySelectorAll(
      'a[href*="/chat/channel/"], a[href*="/chat/user/"], a[href*="/chat/"], [data-testid*="channel-item"], [data-testid*="conversation"]'
    );

    links.forEach((el, index) => {
      const href = el.getAttribute('href') || '';
      const text = (el.innerText || el.textContent || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const name = lines[0] || `Conversation ${index + 1}`;
      const id = href || `ch_${name}`;

      if (!seenIds.has(id) && name.length < 50 && !['Chats', 'Requests', 'Threads'].includes(name)) {
        seenIds.add(id);
        channelItems.push({
          id,
          channelUrl: href,
          name: name.replace(/^u\//, ''),
          preview: lines[1] || '',
          time: lines[2] || '',
          type: 'direct',
          memberCount: 2
        });
      }
    });

    // 2. Scan floating chat dock / popup elements (as seen in Reddit's multi-pane chat widget)
    const chatRoots = document.querySelectorAll(
      '[role="dialog"], aside, [aria-label*="chat" i], section, div[class*="Chat"]'
    );

    chatRoots.forEach(root => {
      // Find rows that represent chat conversation list items
      const candidateRows = root.querySelectorAll(
        '[role="button"], [role="listitem"], [role="tab"], div[tabindex="0"], div[class*="conversation" i], div[class*="channel" i]'
      );

      candidateRows.forEach(row => {
        const text = (row.innerText || row.textContent || '').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        const firstLine = lines[0];
        // Exclude UI controls
        if (['Chats', 'Requests', 'Threads', 'Direct', 'All', 'Message', 'Send', 'New Chat'].includes(firstLine)) return;
        if (firstLine.length > 30) return;

        // Check if row contains timestamp or chat indicator (e.g. "PM", "AM", "Yesterday", "You:")
        const hasTimeOrSnippet = lines.some(l =>
          l.includes('AM') || l.includes('PM') || l.includes('Yesterday') || l.includes('You:') || /^\d+[mhd]$/.test(l)
        );

        if (hasTimeOrSnippet || lines.length >= 2) {
          const username = firstLine.replace(/^u\//, '');
          const id = `chat_${username}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            channelItems.push({
              id,
              channelUrl: `/chat/user/${username}`,
              name: username,
              preview: lines.find(l => l.startsWith('You:') || l !== firstLine) || '',
              time: lines.find(l => l.includes('AM') || l.includes('PM') || l.includes('Yesterday')) || '',
              type: 'direct',
              memberCount: 2
            });
          }
        }
      });

      // 3. Scan active conversation title from pane header (e.g. "Pshyce11")
      const headerTitle = root.querySelector(
        'header h1, header h2, [data-testid="chat-header-title"], [class*="header" i] [class*="title" i], [class*="header" i] span'
      );
      if (headerTitle) {
        const activeName = (headerTitle.innerText || headerTitle.textContent || '').trim();
        if (activeName && !['Chats', 'Requests', 'Threads'].includes(activeName) && activeName.length < 30) {
          const id = `chat_${activeName}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            channelItems.unshift({
              id,
              channelUrl: `/chat/user/${activeName}`,
              name: activeName.replace(/^u\//, ''),
              preview: '(Active Open Chat)',
              time: 'Now',
              type: 'direct',
              memberCount: 2
            });
          }
        }
      }
    });

    return channelItems;
  }

  /**
   * Identifies currently open chat conversation metadata
   */
  function getActiveConversationInfo() {
    const headerTitle = document.querySelector(
      'header h1, header h2, [data-testid="chat-header-title"], .chat-header-name, [class*="header" i] [class*="title" i]'
    );
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
      '[data-testid="message-content"], .message-body, [role="row"], [data-testid="chat-message"], div[class*="Message"]'
    );
    return messages.length;
  }

  /**
   * Scrolls chat view to load older messages
   */
  async function scrollUpChatContainer() {
    const scrollContainer = document.querySelector(
      '[data-testid="virtuoso-scroller"], [data-testid="message-scroller"], .messages-scroll-container, div[class*="scroller" i]'
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      await sleep(800);
    }
  }

  /**
   * Purges user messages in the active chat view with human-like delays
   */
  async function executeChatPurgeLoop(currentUsername = null, maxRounds = 30) {
    let totalDeleted = 0;

    for (let round = 0; round < maxRounds; round++) {
      if (abortPurge) break;

      // Find delete buttons or 3-dots menus on messages
      const actionMenus = document.querySelectorAll(
        '[aria-label="More message options"], [aria-label="More options"], button[title="More"], [data-testid="message-actions-trigger"]'
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
        if (remaining === 0) break;
      }
    }

    return { totalDeleted, aborted: abortPurge };
  }

  /**
   * Automates leaving the current conversation
   */
  async function automateLeaveCurrentChat() {
    const settingsBtn = document.querySelector(
      '[aria-label="Channel settings"], [aria-label="Conversation details"], [data-testid="chat-info-btn"], button[title*="Settings" i]'
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
