/**
 * Enhanced & Minimal Side Panel Controller
 * Bulk Reddit Nuke & Privacy Cleaner
 */

import { RedditApiClient } from '../core/api-client.js';
import { FilterEngine } from '../core/filters.js';
import { HistoryHarvester } from '../core/harvester.js';
import { HistoryNuker } from '../core/nuker.js';
import { HistoryExporter } from '../core/exporter.js';
import { AdaptiveRateLimiter } from '../core/rate-limiter.js';
import { RedditChatCleaner } from '../core/chat-cleaner.js';

// Application State
const state = {
  session: null,
  apiClient: new RedditApiClient(),
  rateLimiter: null,
  filterEngine: new FilterEngine(),
  harvester: null,
  nuker: null,
  chatCleaner: null,
  harvestedComments: [],
  harvestedPosts: [],
  targetItems: [],
  abortController: null,
  isRunning: false,
  isPaused: false,
  isTerminalCollapsed: false
};

// DOM Elements
const el = {
  // Session
  sessionPill: document.getElementById('session-pill'),
  accountName: document.getElementById('account-name'),
  btnQuickBackup: document.getElementById('btn-quick-backup'),
  btnToggleChat: document.getElementById('btn-toggle-chat'),

  // Telemetry HUD
  metricHarvested: document.getElementById('metric-harvested'),
  metricOverwritten: document.getElementById('metric-overwritten'),
  metricPurged: document.getElementById('metric-purged'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercent: document.getElementById('progress-percent'),
  progressBar: document.getElementById('progress-bar'),
  rateLimitAlert: document.getElementById('rate-limit-alert'),
  rateLimitMsg: document.getElementById('rate-limit-msg'),

  // Action Station
  idleControls: document.getElementById('idle-controls'),
  activeControls: document.getElementById('active-controls'),
  btnHarvest: document.getElementById('btn-harvest'),
  btnStartNuke: document.getElementById('btn-start-nuke'),
  nukeBtnLabel: document.getElementById('nuke-btn-label'),
  btnPause: document.getElementById('btn-pause'),
  btnResume: document.getElementById('btn-resume'),
  btnAbort: document.getElementById('btn-abort'),

  // Collapsible Filters
  toggleFilterDrawer: document.getElementById('toggle-filter-drawer'),
  filterDrawerBody: document.getElementById('filter-drawer-body'),
  filterChevron: document.getElementById('filter-chevron'),
  filterSummaryBadge: document.getElementById('filter-summary-badge'),
  filterDateRange: document.getElementById('filter-date-range'),
  filterKarma: document.getElementById('filter-karma'),
  filterSubreddits: document.getElementById('filter-subreddits'),
  filterPreserveSaved: document.getElementById('filter-preserve-saved'),
  filterPreserveGilded: document.getElementById('filter-preserve-gilded'),
  btnSaveFilters: document.getElementById('btn-save-filters'),

  // Chat Drawer
  drawerChat: document.getElementById('drawer-chat'),
  btnCloseChatDrawer: document.getElementById('btn-close-chat-drawer'),
  btnScanChat: document.getElementById('btn-scan-chat'),
  chatResults: document.getElementById('chat-results'),

  // Precision Terminal Dock
  terminalBarToggle: document.getElementById('terminal-bar-toggle'),
  terminalBody: document.getElementById('terminal-body'),
  terminalFeed: document.getElementById('terminal-feed'),
  logStatusPeek: document.getElementById('log-status-peek'),
  btnClearLogs: document.getElementById('btn-clear-logs'),
  btnDockToggle: document.getElementById('btn-dock-toggle'),
  dockChevron: document.getElementById('dock-chevron'),

  // Safety Confirmation Modal
  confirmModal: document.getElementById('confirm-modal'),
  modalTargetCount: document.getElementById('modal-target-count'),
  modalConfirmCheckbox: document.getElementById('modal-confirm-checkbox'),
  btnModalCancel: document.getElementById('btn-modal-cancel'),
  btnModalConfirm: document.getElementById('btn-modal-confirm')
};

/**
 * Appends a timestamped log line to the precision terminal dock
 */
function log(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-entry ${type}`;

  const now = new Date();
  const timeStr = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join(':');

  line.textContent = `[${timeStr}] ${message}`;
  el.terminalFeed.appendChild(line);
  el.terminalFeed.scrollTop = el.terminalFeed.scrollHeight;

  // Update peek text on the collapsed bar
  el.logStatusPeek.textContent = message;
}

/**
 * Initializes Rate Limiter with UI status callbacks
 */
function initRateLimiter() {
  state.rateLimiter = new AdaptiveRateLimiter({
    baseDelayMs: 800,
    jitterMs: 400,
    onStatusChange: (status) => {
      if (status.type === 'BACKOFF') {
        el.rateLimitAlert.classList.remove('hidden');
        el.rateLimitMsg.textContent = status.message;
        log(`RATE-LIMIT: 429 hit. Backoff ${status.seconds}s`, 'warn');
      } else if (status.type === 'COUNTDOWN') {
        el.rateLimitMsg.textContent = `Backoff active: resuming in ${status.remainingSeconds}s...`;
      } else if (status.type === 'RESUMED') {
        el.rateLimitAlert.classList.add('hidden');
        log('RATE-LIMIT: Backoff finished. Resuming.', 'success');
      }
    }
  });

  state.harvester = new HistoryHarvester(state.apiClient, state.rateLimiter);
  state.nuker = new HistoryNuker(state.apiClient, state.rateLimiter);
  state.chatCleaner = new RedditChatCleaner(state.apiClient);
}

/**
 * Detects active Reddit session
 */
async function checkAuthSession() {
  try {
    el.accountName.textContent = 'Detecting...';
    const profile = await state.apiClient.getMe();
    state.session = profile;

    el.sessionPill.className = 'account-pill online';
    el.accountName.textContent = `u/${profile.username}`;
    el.sessionPill.title = `Connected: u/${profile.username} (Karma: ${profile.totalKarma})`;

    log(`AUTH: Connected as u/${profile.username}`, 'success');
  } catch (err) {
    const stored = await chrome.storage.local.get('redditSession');
    if (stored.redditSession && stored.redditSession.isLoggedIn) {
      state.session = stored.redditSession;
      state.apiClient.setCredentials(stored.redditSession.username, stored.redditSession.modhash);

      el.sessionPill.className = 'account-pill online';
      el.accountName.textContent = `u/${stored.redditSession.username}`;
      log(`AUTH: Cached session restored: u/${stored.redditSession.username}`, 'info');
      return;
    }

    el.sessionPill.className = 'account-pill offline';
    el.accountName.textContent = 'Not Logged In';
    log('AUTH: Please log in to Reddit in Chrome to enable actions.', 'warn');
  }
}

/**
 * Filter Drawer Toggling
 */
function setupDrawers() {
  el.toggleFilterDrawer.addEventListener('click', () => {
    const isClosed = el.filterDrawerBody.classList.contains('hidden');
    if (isClosed) {
      el.filterDrawerBody.classList.remove('hidden');
      el.filterChevron.classList.add('expanded');
    } else {
      el.filterDrawerBody.classList.add('hidden');
      el.filterChevron.classList.remove('expanded');
    }
  });

  // Chat Drawer Toggling
  el.btnToggleChat.addEventListener('click', () => {
    el.drawerChat.classList.toggle('hidden');
  });

  el.btnCloseChatDrawer.addEventListener('click', () => {
    el.drawerChat.classList.add('hidden');
  });

  // Terminal Dock Toggling
  const toggleTerminal = () => {
    state.isTerminalCollapsed = !state.isTerminalCollapsed;
    if (state.isTerminalCollapsed) {
      el.terminalBody.classList.add('collapsed');
      el.dockChevron.classList.add('down');
    } else {
      el.terminalBody.classList.remove('collapsed');
      el.dockChevron.classList.remove('down');
      el.terminalFeed.scrollTop = el.terminalFeed.scrollHeight;
    }
  };

  el.btnDockToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTerminal();
  });

  el.terminalBarToggle.addEventListener('click', (e) => {
    if (e.target.closest('#btn-clear-logs')) return;
    toggleTerminal();
  });

  el.btnClearLogs.addEventListener('click', (e) => {
    e.stopPropagation();
    el.terminalFeed.innerHTML = '';
    el.logStatusPeek.textContent = '[Cleared]';
  });
}

/**
 * Updates the summary badge on the filter drawer
 */
function updateFilterSummaryBadge() {
  const parts = [];
  const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'all';
  if (targetType === 'comments') parts.push('Comments');
  else if (targetType === 'posts') parts.push('Posts');
  else parts.push('All History');

  const dateRange = el.filterDateRange.value;
  if (dateRange !== 'all') parts.push(`>${dateRange}`);

  const karmaVal = el.filterKarma.value.trim();
  if (karmaVal) parts.push(`Karma>${karmaVal}`);

  el.filterSummaryBadge.textContent = parts.join(' • ');
}

/**
 * Loads stored filter settings
 */
async function loadSavedFilters() {
  const { filters } = await chrome.storage.local.get('filters');
  if (!filters) return;

  state.filterEngine.setFilters(filters);

  if (filters.targetType) {
    const radio = document.querySelector(`input[name="targetType"][value="${filters.targetType}"]`);
    if (radio) radio.checked = true;
  }

  if (filters.dateRange) el.filterDateRange.value = filters.dateRange;
  if (filters.preserveKarmaAbove !== null && filters.preserveKarmaAbove !== undefined) {
    el.filterKarma.value = filters.preserveKarmaAbove;
  }
  if (filters.subreddits) el.filterSubreddits.value = filters.subreddits.join(', ');
  if (filters.subredditMode) {
    const subRadio = document.querySelector(`input[name="subredditMode"][value="${filters.subredditMode}"]`);
    if (subRadio) subRadio.checked = true;
  }
  if (typeof filters.preserveSaved === 'boolean') {
    el.filterPreserveSaved.checked = filters.preserveSaved;
  }
  if (typeof filters.preserveGilded === 'boolean') {
    el.filterPreserveGilded.checked = filters.preserveGilded;
  }

  updateFilterSummaryBadge();
}

/**
 * Saves filter settings from UI into storage
 */
async function saveFiltersFromUI() {
  const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'all';
  const subredditMode = document.querySelector('input[name="subredditMode"]:checked')?.value || 'blacklist';
  const dateRange = el.filterDateRange.value;
  const minKarmaVal = el.filterKarma.value.trim();
  const preserveKarmaAbove = minKarmaVal !== '' ? parseInt(minKarmaVal, 10) : null;
  const subreddits = el.filterSubreddits.value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const preserveSaved = el.filterPreserveSaved.checked;
  const preserveGilded = el.filterPreserveGilded.checked;

  const filters = {
    targetType,
    subredditMode,
    dateRange,
    preserveKarmaAbove,
    subreddits,
    preserveSaved,
    preserveGilded
  };

  state.filterEngine.setFilters(filters);
  await chrome.storage.local.set({ filters });
  updateFilterSummaryBadge();

  // Re-apply filters to in-memory items if already harvested
  if (state.harvestedComments.length > 0 || state.harvestedPosts.length > 0) {
    const all = [...state.harvestedComments, ...state.harvestedPosts];
    state.targetItems = state.filterEngine.filterBatch(all);
    el.metricHarvested.textContent = state.targetItems.length;
    el.btnStartNuke.disabled = state.targetItems.length === 0;
    el.nukeBtnLabel.textContent = `Nuke (${state.targetItems.length})`;
  }

  // Smoothly collapse drawer after saving
  el.filterDrawerBody.classList.add('hidden');
  el.filterChevron.classList.remove('expanded');
  log('FILTERS: Rule settings applied and saved.', 'success');
}

/**
 * Scan Profile / Harvest History
 */
async function handleHarvest() {
  if (!state.session || !state.session.username) {
    log('SCAN: Please log in to Reddit first!', 'danger');
    return;
  }

  try {
    state.isRunning = true;
    state.abortController = new AbortController();
    el.btnHarvest.disabled = true;
    el.btnStartNuke.disabled = true;

    // Ensure terminal is expanded during active jobs
    if (state.isTerminalCollapsed) {
      state.isTerminalCollapsed = false;
      el.terminalBody.classList.remove('collapsed');
      el.dockChevron.classList.remove('down');
    }

    log(`HARVEST: Scanning profile u/${state.session.username}...`, 'cyan');
    el.progressStatusText.textContent = 'Scanning Reddit profile...';
    el.progressBar.style.width = '10%';

    const { comments, posts } = await state.harvester.harvestAll(
      state.abortController.signal,
      (progress) => {
        el.progressStatusText.textContent = progress.message;
        log(progress.message, 'info');
      }
    );

    state.harvestedComments = comments;
    state.harvestedPosts = posts;

    const allItems = [...comments, ...posts];
    state.targetItems = state.filterEngine.filterBatch(allItems);

    el.metricHarvested.textContent = state.targetItems.length;
    el.progressStatusText.textContent = `Indexed ${state.targetItems.length} matching items`;
    el.progressPercent.textContent = '100%';
    el.progressBar.style.width = '100%';

    log(`HARVEST: Found ${comments.length} comments & ${posts.length} posts.`, 'success');
    log(`FILTERS: ${state.targetItems.length} items queued for destruction.`, 'cyan');

    el.btnQuickBackup.disabled = allItems.length === 0;

    if (state.targetItems.length > 0) {
      el.btnStartNuke.disabled = false;
      el.nukeBtnLabel.textContent = `Nuke (${state.targetItems.length})`;
    } else {
      el.nukeBtnLabel.textContent = 'Overwrite & Nuke';
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      log('HARVEST: Aborted by user.', 'warn');
    } else {
      log(`HARVEST ERROR: ${err.message}`, 'danger');
    }
  } finally {
    state.isRunning = false;
    el.btnHarvest.disabled = false;
  }
}

/**
 * Pre-Nuke JSON Backup Download
 */
function handleDownloadBackup() {
  const allComments = state.harvestedComments;
  const allPosts = state.harvestedPosts;

  if (allComments.length === 0 && allPosts.length === 0) {
    log('BACKUP: No items in memory to export. Scan profile first.', 'warn');
    return;
  }

  const username = state.session?.username || 'reddit_user';
  const backup = HistoryExporter.compileBackup(username, allComments, allPosts);
  const filename = HistoryExporter.downloadJson(backup);
  log(`BACKUP: Exported ${backup.metadata.totalItems} items to ${filename}`, 'success');
}

/**
 * Confirmation Modal
 */
function openConfirmModal() {
  el.modalTargetCount.textContent = state.targetItems.length;
  el.modalConfirmCheckbox.checked = false;
  el.btnModalConfirm.disabled = true;
  el.confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  el.confirmModal.classList.add('hidden');
}

/**
 * Executes the Overwrite & Nuke Pipeline
 */
async function executeNuke() {
  closeConfirmModal();

  if (state.targetItems.length === 0) {
    log('NUKE: No items queued.', 'warn');
    return;
  }

  try {
    state.isRunning = true;
    state.isPaused = false;
    state.abortController = new AbortController();

    el.idleControls.classList.add('hidden');
    el.activeControls.classList.remove('hidden');
    el.btnPause.classList.remove('hidden');
    el.btnResume.classList.add('hidden');

    log('==============================================', 'cyan');
    log(`NUKE INITIATED: Processing ${state.targetItems.length} items`, 'danger');
    log('1. Overwriting with random cryptographic gibberish', 'warn');
    log('2. Permanent deletion from Reddit database', 'danger');
    log('==============================================', 'cyan');

    const total = state.targetItems.length;
    let lastLoggedIndex = 0;

    const result = await state.nuker.nukeBatch(
      state.targetItems,
      state.abortController.signal,
      (progress) => {
        el.progressStatusText.textContent = progress.message;
        const pct = Math.round((progress.index / total) * 100);
        el.progressPercent.textContent = `${pct}%`;
        el.progressBar.style.width = `${pct}%`;

        if (progress.stage === 'ITEM_COMPLETE') {
          el.metricOverwritten.textContent = progress.overwrittenCount;
          el.metricPurged.textContent = progress.deletedCount;
          log(progress.message, 'success');
        } else if (progress.index !== lastLoggedIndex && progress.stage === 'OVERWRITING') {
          lastLoggedIndex = progress.index;
          log(progress.message, 'info');
        }
      }
    );

    log(`NUKE COMPLETED: Overwritten: ${result.overwrittenCount} | Purged: ${result.deletedCount}`, 'success');
    el.progressStatusText.textContent = 'All operations completed!';
    el.btnStartNuke.disabled = true;
    el.nukeBtnLabel.textContent = 'Overwrite & Nuke';
  } catch (err) {
    if (err.name === 'AbortError') {
      log('NUKE ABORTED: Stopped by user.', 'warn');
      el.progressStatusText.textContent = 'Operation aborted';
    } else {
      log(`NUKE ERROR: ${err.message}`, 'danger');
      el.progressStatusText.textContent = 'Error during operation';
    }
  } finally {
    state.isRunning = false;
    el.idleControls.classList.remove('hidden');
    el.activeControls.classList.add('hidden');
  }
}

/**
 * Pause / Resume / Abort handlers
 */
function handlePause() {
  if (state.nuker && state.isRunning) {
    state.nuker.pause();
    state.isPaused = true;
    el.btnPause.classList.add('hidden');
    el.btnResume.classList.remove('hidden');
    el.progressStatusText.textContent = 'PAUSED by user';
    log('OPERATION: Paused.', 'warn');
  }
}

function handleResume() {
  if (state.nuker && state.isPaused) {
    state.nuker.resume();
    state.isPaused = false;
    el.btnResume.classList.add('hidden');
    el.btnPause.classList.remove('hidden');
    el.progressStatusText.textContent = 'Resuming operations...';
    log('OPERATION: Resumed.', 'success');
  }
}

function handleAbort() {
  if (state.abortController) {
    state.abortController.abort();
    if (state.nuker) state.nuker.resume();
  }
}

/**
 * Experimental Chat Scanner
 */
async function handleScanChat() {
  el.btnScanChat.disabled = true;
  el.chatResults.innerHTML = '<span class="muted-text">Connecting to Reddit Chat GraphQL...</span>';

  try {
    log('CHAT: Querying Reddit Chat GraphQL...', 'cyan');
    const data = await state.chatCleaner.fetchConversations();
    el.chatResults.innerHTML = `
      <div style="color: var(--accent-emerald); font-weight: 600;">✓ Connected to Reddit GraphQL identity</div>
      <p style="margin-top: 4px; color: var(--text-secondary); font-size: 10px;">
        Identity: ${data.identity?.id || 'Active'}<br>
        Direct Chat channels ready for message purge.
      </p>
    `;
    log('CHAT: GraphQL connection established successfully.', 'success');
  } catch (err) {
    el.chatResults.innerHTML = `
      <div style="color: var(--accent-amber);">⚠️ Reddit Chat Note:</div>
      <p style="margin-top: 2px; color: var(--text-secondary); font-size: 10px;">
        ${err.message}<br>
        Tip: Open <code>reddit.com/chat</code> in an active tab to synchronize tokens.
      </p>
    `;
    log(`CHAT: ${err.message}`, 'warn');
  } finally {
    el.btnScanChat.disabled = false;
  }
}

/**
 * Event Listeners
 */
function bindEvents() {
  el.btnHarvest.addEventListener('click', handleHarvest);
  el.btnStartNuke.addEventListener('click', openConfirmModal);
  el.btnQuickBackup.addEventListener('click', handleDownloadBackup);
  el.btnSaveFilters.addEventListener('click', saveFiltersFromUI);

  el.btnPause.addEventListener('click', handlePause);
  el.btnResume.addEventListener('click', handleResume);
  el.btnAbort.addEventListener('click', handleAbort);

  el.btnScanChat.addEventListener('click', handleScanChat);

  // Modal events
  el.modalConfirmCheckbox.addEventListener('change', (e) => {
    el.btnModalConfirm.disabled = !e.target.checked;
  });
  el.btnModalCancel.addEventListener('click', closeConfirmModal);
  el.btnModalConfirm.addEventListener('click', executeNuke);

  // Dynamic filter inputs update badge
  el.filterDateRange.addEventListener('change', updateFilterSummaryBadge);
  el.filterKarma.addEventListener('input', updateFilterSummaryBadge);
  document.querySelectorAll('input[name="targetType"]').forEach((r) => {
    r.addEventListener('change', updateFilterSummaryBadge);
  });
}

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  setupDrawers();
  initRateLimiter();
  bindEvents();
  await loadSavedFilters();
  await checkAuthSession();
});
