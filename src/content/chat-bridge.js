/**
 * UnTrace - Reddit Chat DOM Automation Bridge
 * Injected across Reddit domains (*://*.reddit.com/*, all_frames: true)
 * Deeply traverses Light DOM and Shadow DOM to discover and automate chat deletion.
 */

(function () {
  console.log('[UnTrace Chat Bridge] Script loaded on:', window.location.href);

  let isPurging = false;
  let abortPurge = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CHAT_DOM') {
      try {
        const shadowRoots = getAllShadowRoots(document);
        const isChatOpen = isChatWidgetVisible(shadowRoots);
        const channels = scanChannelsDeep(shadowRoots);
        const activeConversation = getActiveConversationInfo(shadowRoots);
        const messageCount = countVisibleMessages(shadowRoots);

        console.log(`[UnTrace Chat Bridge] Scan complete: ${channels.length} channels, ${messageCount} visible messages. isChatOpen=${isChatOpen}`);

        sendResponse({
          success: true,
          url: window.location.href,
          isChatOpen,
          shadowRootsCount: shadowRoots.length,
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
          const shadowRoots = getAllShadowRoots(document);
          const result = await executeChatPurgeLoop(shadowRoots, message.username);
          isPurging = false;
          sendResponse({ success: true, ...result });
        } catch (err) {
          isPurging = false;
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }
  });

  /**
   * Recursively gathers all open Shadow DOM roots in the document
   */
  function getAllShadowRoots(root = document) {
    const roots = [root];
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
      let node = walker.nextNode();
      while (node) {
        if (node.shadowRoot) {
          roots.push(...getAllShadowRoots(node.shadowRoot));
        }
        node = walker.nextNode();
      }
    } catch (_) {}
    return roots;
  }

  /**
   * Queries selector across document and all open Shadow DOMs
   */
  function queryAllAcrossRoots(selector, roots) {
    const elements = [];
    for (const r of roots) {
      try {
        const found = r.querySelectorAll(selector);
        for (const el of found) {
          elements.push(el);
        }
      } catch (_) {}
    }
    return elements;
  }

  /**
   * Checks if Reddit Chat (dock or full page) is present on screen
   */
  function isChatWidgetVisible(roots) {
    if (window.location.pathname.startsWith('/chat')) return true;
    const chatElements = queryAllAcrossRoots(
      '[role="dialog"], aside, [aria-label*="chat" i], div[class*="Chat"], [data-testid*="chat"], shreddit-chat',
      roots
    );
    return chatElements.length > 0;
  }

  /**
   * Deep scan of channels/conversations across Light and Shadow DOM
   */
  function scanChannelsDeep(roots) {
    const channelItems = [];
    const seenIds = new Set();

    // Strategy 1: Explicit chat links or data-testid anchors
    const links = queryAllAcrossRoots(
      'a[href*="/chat/channel/"], a[href*="/chat/user/"], a[href*="/chat/"], [data-testid*="channel-item"], [data-testid*="conversation"]',
      roots
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

    // Strategy 2: Scan all candidate row elements across roots
    const candidateRows = queryAllAcrossRoots(
      '[role="button"], [role="listitem"], [role="tab"], div[tabindex="0"], div[class*="row" i], div[class*="item" i]',
      roots
    );

    candidateRows.forEach(row => {
      const text = (row.innerText || row.textContent || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const firstLine = lines[0];
      // Skip known controls
      if (['Chats', 'Requests', 'Threads', 'Direct', 'All', 'Message', 'Send', 'New Chat', 'Create', 'Search', 'Clear'].includes(firstLine)) return;
      if (firstLine.length > 30) return;

      // Look for indicators of a conversation list row (has timestamp or multiple lines)
      const hasTime = lines.some(l =>
        l.includes('AM') || l.includes('PM') || l.includes('Yesterday') || l.includes('ago') || /^\d+[mhd]$/.test(l)
      );
      const hasSnippet = lines.some(l => l.startsWith('You:') || l.includes(':'));

      if (hasTime || hasSnippet || (lines.length >= 2 && lines[0].length < 24)) {
        const username = firstLine.replace(/^u\//, '');
        const id = `chat_${username}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          channelItems.push({
            id,
            channelUrl: `/chat/user/${username}`,
            name: username,
            preview: lines.find(l => l.startsWith('You:') || (l !== firstLine && !l.includes('AM') && !l.includes('PM'))) || lines[1] || '',
            time: lines.find(l => l.includes('AM') || l.includes('PM') || l.includes('Yesterday')) || '',
            type: 'direct',
            memberCount: 2
          });
        }
      }
    });

    // Strategy 3: Scan active conversation header (e.g. "Pshyce11" in the right pane)
    const headers = queryAllAcrossRoots(
      'header h1, header h2, [data-testid="chat-header-title"], [class*="header" i] [class*="title" i], [class*="header" i] span',
      roots
    );

    for (const h of headers) {
      const text = (h.innerText || h.textContent || '').trim();
      if (text && !['Chats', 'Requests', 'Threads', 'Messages'].includes(text) && text.length < 30) {
        const username = text.replace(/^u\//, '');
        const id = `chat_${username}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          channelItems.unshift({
            id,
            channelUrl: `/chat/user/${username}`,
            name: username,
            preview: '(Active Open Chat)',
            time: 'Now',
            type: 'direct',
            memberCount: 2
          });
        }
      }
    }

    return channelItems;
  }

  /**
   * Identifies currently open chat conversation metadata
   */
  function getActiveConversationInfo(roots) {
    const headers = queryAllAcrossRoots(
      'header h1, header h2, [data-testid="chat-header-title"], .chat-header-name, [class*="header" i] [class*="title" i]',
      roots
    );
    const headerTitle = headers[0];
    return {
      title: headerTitle ? (headerTitle.innerText || headerTitle.textContent || '').trim() : 'Active Chat',
      url: window.location.href
    };
  }

  /**
   * Counts visible messages inside the active chat thread
   */
  function countVisibleMessages(roots) {
    const messages = queryAllAcrossRoots(
      '[data-testid="message-content"], .message-body, [role="row"], [data-testid="chat-message"], div[class*="Message"]',
      roots
    );
    return messages.length;
  }

  /**
   * Scrolls chat view to load older messages
   */
  async function scrollUpChatContainer(roots) {
    const containers = queryAllAcrossRoots(
      '[data-testid="virtuoso-scroller"], [data-testid="message-scroller"], .messages-scroll-container, div[class*="scroller" i]',
      roots
    );
    for (const c of containers) {
      c.scrollTop = 0;
    }
    await sleep(800);
  }

  /**
   * Purges user messages in the active chat view with human-like delays
   */
  async function executeChatPurgeLoop(roots, currentUsername = null, maxRounds = 30) {
    let totalDeleted = 0;

    for (let round = 0; round < maxRounds; round++) {
      if (abortPurge) break;

      const actionMenus = queryAllAcrossRoots(
        '[aria-label="More message options"], [aria-label="More options"], button[title="More"], [data-testid="message-actions-trigger"]',
        roots
      );

      let roundDeletions = 0;

      for (const menuBtn of actionMenus) {
        if (abortPurge) break;

        try {
          menuBtn.click();
          await sleep(350);

          const menuItems = queryAllAcrossRoots('[role="menuitem"], button, div', roots);
          const deleteOption = menuItems.find(item => {
            const text = (item.textContent || '').trim().toLowerCase();
            return text === 'delete message' || text === 'delete' || text.startsWith('delete for');
          });

          if (deleteOption) {
            deleteOption.click();
            await sleep(400);

            const confirmButtons = queryAllAcrossRoots('[role="dialog"] button, .modal button', roots);
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
            document.body.click();
            await sleep(200);
          }
        } catch (_) {
          document.body.click();
        }
      }

      if (roundDeletions === 0) {
        await scrollUpChatContainer(roots);
        const remaining = countVisibleMessages(roots);
        if (remaining === 0) break;
      }
    }

    return { totalDeleted, aborted: abortPurge };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
