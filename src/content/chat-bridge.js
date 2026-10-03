/**
 * UnTrace - Reddit Chat DOM Automation Bridge
 * Injected across Reddit domains (*://*.reddit.com/*, all_frames: true)
 * Deeply traverses Light DOM and Shadow DOM to discover and automate chat deletion.
 * Supports modern Reddit SendBird web components (<rs-rooms-nav>, <rs-timeline-event>).
 */

(function () {
  console.log('[UnTrace Chat Bridge] Script loaded on:', window.location.href);

  let isPurging = false;
  let abortPurge = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CHAT_DOM') {
      (async () => {
        try {
          const shadowRoots = getAllShadowRoots(document);
          const isChatOpen = isChatWidgetVisible(shadowRoots);
          // Gently sweep scroll container to mount any virtualized rows
          await sweepScrollChannels(shadowRoots);
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
      })();
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
   * Recursively gathers all open Shadow DOM roots in the document or container
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
   * Queries selector across document/elements and all open Shadow DOMs
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
   * Checks if current page is dedicated Reddit chat (e.g. chat.reddit.com or reddit.com/chat)
   */
  function isChatPage() {
    const host = window.location.hostname;
    const path = window.location.pathname;
    return host === 'chat.reddit.com' || path.startsWith('/chat');
  }

  /**
   * Checks if Reddit Chat (dock or full page) is present on screen
   */
  function isChatWidgetVisible(roots) {
    if (isChatPage()) return true;
    const chatElements = queryAllAcrossRoots(
      'rs-rooms-nav, shreddit-chat, [data-testid="chat-container"], [role="dialog"], aside[aria-label*="chat" i], div[id*="chat" i], [aria-label*="chat" i]',
      roots
    );
    return chatElements.length > 0;
  }

  /**
   * Strict scope isolation: Only returns roots within actual chat containers.
   * Prevents scanning general Reddit homepage feeds, post buttons, comment cards, etc.
   */
  function getChatRoots(roots) {
    if (isChatPage()) return roots;

    const chatContainers = queryAllAcrossRoots(
      'rs-rooms-nav, shreddit-chat, [data-testid="chat-container"], [role="dialog"], aside[aria-label*="chat" i], div[id*="chat" i], [aria-label*="chat" i]',
      roots
    );

    if (chatContainers.length === 0) {
      return [];
    }

    const isolatedRoots = [];
    for (const container of chatContainers) {
      isolatedRoots.push(...getAllShadowRoots(container));
    }
    return isolatedRoots;
  }

  /**
   * Robust conversation validator to reject subreddits, comment counts, video timestamps, and UI controls.
   */
  function isValidConversationName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length === 0 || clean.length > 50) return false;

    // Reject subreddits (e.g., "r/memes", "r/DesiSexTalk")
    if (/^r\//i.test(clean) || clean.includes('/r/')) return false;

    // Reject comment counts (e.g., "33 comments", "8 comments", "1 comment")
    if (/\b\d+\s*comments?\b/i.test(clean)) return false;

    // Reject video timestamps (e.g., "0:10", "1:23")
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(clean)) return false;

    // Reject generic controls and navigation items
    const IGNORED = new Set([
      'chats', 'requests', 'threads', 'messages', 'direct', 'all', 'new chat',
      'create', 'search', 'clear', 'share', 'reddit pro', 'save', 'hide', 'report',
      'reply', 'award', 'vote', 'upvote', 'downvote', 'join', 'joined', 'leave',
      'view thread', 'settings', 'notifications', 'home', 'popular', 'explore',
      'help', 'help center', 'user agreement', 'privacy policy', 'content policy',
      'accessibility', 'reddit rules', 'terms', 'about reddit', 'delete my messages',
      'hide conversations after deleting', 'upgrade', 'upgrade for a small one-time payment'
    ]);
    if (IGNORED.has(clean.toLowerCase())) return false;

    // Reject pure numbers or punctuation
    if (/^[\d\s\-_.,!@#$%^&*()]+$/.test(clean) && !clean.startsWith('u/')) return false;

    return true;
  }

  /**
   * Sweeps conversation list scroll containers (both SendBird rs-virtual-scroll and virtuoso scrollers)
   */
  async function sweepScrollChannels(roots) {
    // 1. SendBird virtual scroll container
    const virtualScrollers = queryAllAcrossRoots('rs-virtual-scroll', roots);
    for (const vs of virtualScrollers) {
      try {
        const orig = vs.scrollTop;
        vs.scrollTop = vs.scrollHeight;
        await sleep(150);
        vs.scrollTop = 0;
        await sleep(100);
      } catch (_) {}
    }

    // 2. Generic scrollers inside chat containers
    const scrollers = queryAllAcrossRoots(
      '[data-testid*="channel-list"], [data-testid*="virtuoso-scroller"], nav[aria-label*="chat" i], div[class*="channelList" i], [aria-label*="conversations" i], aside div[style*="overflow-y"], [role="navigation"] div[style*="overflow"]',
      roots
    ).filter(el => el.scrollHeight > el.clientHeight);

    if (scrollers.length === 0) return;

    for (const scroller of scrollers) {
      const origTop = scroller.scrollTop;
      const step = Math.max(120, Math.floor(scroller.clientHeight * 0.75));
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;

      for (let pos = step; pos <= maxScroll; pos += step) {
        scroller.scrollTop = pos;
        await sleep(80);
      }
      scroller.scrollTop = origTop;
      await sleep(60);
    }
  }

  /**
   * Deep scan of channels/conversations across Light and Shadow DOM.
   * Isolated strictly to chat roots to prevent picking up Reddit post feeds.
   */
  function scanChannelsDeep(roots) {
    const chatRoots = getChatRoots(roots);
    // If no chat container is open and we're not on chat.reddit.com, don't scan anything!
    if (chatRoots.length === 0) {
      return [];
    }

    const channelItems = [];
    const seenIds = new Set();

    function getNormalizedId(name, href = '') {
      const lowerName = (name || '').replace(/^u\//, '').trim().toLowerCase();
      if (href && href.includes('/chat/channel/')) {
        const chPart = href.split('/chat/channel/')[1].split('/')[0].split('?')[0];
        return `channel_${chPart.toLowerCase()}`;
      }
      if (href && href.includes('/chat/user/')) {
        const uPart = href.split('/chat/user/')[1].split('/')[0].split('?')[0].replace(/^u\//, '');
        return `chat_${uPart.toLowerCase()}`;
      }
      return `chat_${lowerName}`;
    }

    function extractTimeCandidate(el, lines, excludeText = '') {
      if (el && el.querySelector) {
        const timeEl = el.querySelector('time, [datetime], [title*="202"], [aria-label*="202"], [aria-label*="ago" i], [title*="ago" i]');
        if (timeEl) {
          const dt = timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || timeEl.getAttribute('aria-label') || (timeEl.innerText || '').trim();
          if (dt) return dt;
        }
      }

      const match = lines.find(l => {
        if (!l || l === excludeText) return false;
        return (
          l.includes('AM') || l.includes('PM') || l.includes('Yesterday') ||
          /\b(?:ago|yr\.?|years?|mo\.?|months?|wk\.?|weeks?|days?|hr\.?|hours?|min\.?|mins?|minutes?|yesterday)\b/i.test(l) ||
          /^\d+\s*[ywdhm]$/i.test(l) ||
          /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(l) ||
          /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(l)
        );
      });
      return match || '';
    }

    // Strategy 0: Reddit SendBird Web Components (<rs-rooms-nav-room>)
    // Used on chat.reddit.com and modern Reddit chat apps
    const sendBirdRooms = queryAllAcrossRoots('rs-rooms-nav-room', chatRoots);
    sendBirdRooms.forEach(room => {
      try {
        const linkEl = queryAllAcrossRoots('a', [room.shadowRoot || room])[0] || room.querySelector('a');
        const nameEl = queryAllAcrossRoots('.room-name', [room.shadowRoot || room])[0] || room.querySelector('.room-name');
        const rawName = nameEl ? (nameEl.innerText || nameEl.textContent || '').trim() : '';
        const href = linkEl ? linkEl.getAttribute('href') || '' : '';
        const name = rawName.replace(/^u\//, '').trim();

        if (name && isValidConversationName(name)) {
          const id = getNormalizedId(name, href);
          if (!seenIds.has(id)) {
            seenIds.add(id);
            const isGroup = href.includes('/chat/channel/') || name.includes(',');
            const fullUrl = href.startsWith('http') ? href : (href.startsWith('/chat') ? href : `/chat${href}`);
            channelItems.push({
              id,
              channelUrl: fullUrl || `/chat/user/${name}`,
              name,
              preview: '(Direct Conversation)',
              time: 'Recent',
              type: isGroup ? 'group' : 'direct',
              memberCount: isGroup ? 3 : 2
            });
          }
        }
      } catch (_) {}
    });

    // Strategy 1: Explicit chat links or data-testid anchors inside chatRoots
    const links = queryAllAcrossRoots(
      'a[href*="/chat/channel/"], a[href*="/chat/user/"], a[href*="/chat/r/"], [data-testid*="channel-item"], [data-testid*="conversation"]',
      chatRoots
    );

    links.forEach((el, index) => {
      const href = el.getAttribute('href') || '';
      const text = (el.innerText || el.textContent || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const rawName = lines[0] || `Conversation ${index + 1}`;
      const name = rawName.replace(/^u\//, '');

      if (isValidConversationName(name)) {
        const id = getNormalizedId(name, href);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const isGroup = href.includes('/chat/channel/') ||
                          lines.some(l => /\b\d+\s*members?\b/i.test(l)) ||
                          text.toLowerCase().includes('group') ||
                          name.includes(',');
          const timeStr = extractTimeCandidate(el, lines, rawName);
          const preview = lines.find(l => l !== rawName && l !== timeStr) || lines[1] || '';

          channelItems.push({
            id,
            channelUrl: href || `/chat/user/${name}`,
            name,
            preview,
            time: timeStr,
            type: isGroup ? 'group' : 'direct',
            memberCount: isGroup ? 3 : 2
          });
        }
      }
    });

    // Strategy 2: Candidate row elements ONLY inside chatRoots
    const candidateRows = queryAllAcrossRoots(
      '[role="button"], [role="listitem"], [role="row"], div[class*="row" i], div[class*="item" i], [data-testid*="channel"], [data-testid*="conversation"]',
      chatRoots
    );

    candidateRows.forEach(row => {
      const text = (row.innerText || row.textContent || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const firstLine = lines[0];
      if (!isValidConversationName(firstLine)) return;

      const timeStr = extractTimeCandidate(row, lines, firstLine);
      const hasSnippet = lines.some(l => l.startsWith('You:') || l.includes(':'));

      if (timeStr || hasSnippet || (lines.length >= 2 && lines[0].length < 40)) {
        const username = firstLine.replace(/^u\//, '');
        const id = getNormalizedId(username, '');
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const isGroup = lines.some(l => /\b\d+\s*members?\b/i.test(l)) ||
                          text.toLowerCase().includes('group') ||
                          firstLine.includes(',');
          const preview = lines.find(l => l !== firstLine && l !== timeStr && (l.startsWith('You:') || (!l.includes('AM') && !l.includes('PM')))) || lines[1] || '';

          channelItems.push({
            id,
            channelUrl: `/chat/user/${username}`,
            name: username,
            preview,
            time: timeStr,
            type: isGroup ? 'group' : 'direct',
            memberCount: isGroup ? 3 : 2
          });
        }
      }
    });

    // Strategy 3: Scan active conversation header inside chatRoots
    const headerEls = queryAllAcrossRoots(
      '[data-testid="chat-header-title"], [data-testid="conversation-title"], .chat-header-name',
      chatRoots
    );

    for (const h of headerEls) {
      const text = (h.innerText || h.textContent || '').trim();
      if (!isValidConversationName(text)) continue;

      const username = text.replace(/^u\//, '').trim();
      if (!username || username.length > 24) continue;
      if (!/^[a-zA-Z0-9_\-]+$/.test(username) && !text.includes('Group')) continue;

      const id = getNormalizedId(username, '');
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const isGroup = text.toLowerCase().includes('group');
        channelItems.unshift({
          id,
          channelUrl: `/chat/user/${username}`,
          name: username,
          preview: '(Active Open Chat)',
          time: 'Now',
          type: isGroup ? 'group' : 'direct',
          memberCount: isGroup ? 3 : 2
        });
      }
    }

    return channelItems;
  }

  /**
   * Identifies currently open chat conversation metadata
   */
  function getActiveConversationInfo(roots) {
    const chatRoots = getChatRoots(roots);
    const headers = queryAllAcrossRoots(
      'header h1, header h2, [data-testid="chat-header-title"], .chat-header-name, [class*="header" i] [class*="title" i]',
      chatRoots
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
    const chatRoots = getChatRoots(roots);
    const messages = queryAllAcrossRoots(
      'rs-timeline-event:not([threadroot]), [data-testid="message-content"], .message-body, [role="row"], [data-testid="chat-message"], div[class*="Message"]',
      chatRoots
    );
    return messages.length;
  }

  /**
   * Scrolls chat view to load older messages
   */
  async function scrollUpChatContainer(roots) {
    const chatRoots = getChatRoots(roots);
    const containers = queryAllAcrossRoots(
      'rs-virtual-scroll, [data-testid="virtuoso-scroller"], [data-testid="message-scroller"], .messages-scroll-container, div[class*="scroller" i]',
      chatRoots
    );
    for (const c of containers) {
      c.scrollTop = 0;
    }
    await sleep(600);
  }

  /**
   * Purges user messages in the active chat view with human-like delays
   * Supports both SendBird web components (<rs-timeline-event>) and legacy chat dialogs.
   */
  async function executeChatPurgeLoop(roots, currentUsername = null, maxRounds = 30) {
    let totalDeleted = 0;

    for (let round = 0; round < maxRounds; round++) {
      if (abortPurge) break;

      let roundDeletions = 0;

      // 1. SendBird Timeline Messages: <rs-timeline-event:not([threadroot])>
      const timelineEvents = queryAllAcrossRoots('rs-timeline-event:not([threadroot])', roots);
      if (timelineEvents.length > 0) {
        for (let i = timelineEvents.length - 1; i >= 0; i--) {
          if (abortPurge) break;
          const ev = timelineEvents[i];
          try {
            ev.scrollIntoView({ block: 'nearest' });
            // Dispatch mouseenter to trigger hover action toolbar
            const mouseEnter = new MouseEvent('mouseenter', { bubbles: false, cancelable: true, view: window });
            ev.dispatchEvent(mouseEnter);
            await sleep(80);

            const deleteAction = queryAllAcrossRoots('rs-timeline-event-delete-action', [ev.shadowRoot || ev])[0];
            if (deleteAction) {
              const delBtn = (deleteAction.shadowRoot ? deleteAction.shadowRoot.querySelector('button') : deleteAction.querySelector('button'));
              if (delBtn) {
                delBtn.click();
                await sleep(350);

                const dialog = queryAllAcrossRoots('rs-rpl-dialog-content, [role="dialog"], .modal', roots)[0];
                if (dialog) {
                  const confirmBtn = (dialog.shadowRoot ? dialog.shadowRoot.querySelector('button.button-primary, button') : dialog.querySelector('button.button-primary, button'));
                  if (confirmBtn) {
                    confirmBtn.click();
                    totalDeleted++;
                    roundDeletions++;
                    await sleep(450);
                  }
                }
              }
            }
          } catch (_) {}
        }
      }

      // 2. Legacy / Standard Message Options Trigger
      if (roundDeletions === 0) {
        const actionMenus = queryAllAcrossRoots(
          '[aria-label="More message options"], [aria-label="More options"], button[title="More"], [data-testid="message-actions-trigger"]',
          roots
        );

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
