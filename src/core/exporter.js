/**
 * UnTrace - Pre-Nuke Data Exporter
 * Generates structured JSON backup archives for posts, comments, and private chats
 */

export class HistoryExporter {
  /**
   * Compiles items into an offline backup object
   */
  static compileBackup(username, comments = [], posts = []) {
    return {
      exportedAt: new Date().toISOString(),
      username: username || 'reddit_user',
      metadata: {
        totalComments: comments.length,
        totalPosts: posts.length,
        totalItems: comments.length + posts.length,
        version: '1.0.0'
      },
      comments: comments.map(c => ({
        id: c.data?.name || c.id,
        subreddit: c.data?.subreddit,
        createdUtc: c.data?.created_utc,
        createdAt: c.data?.created_utc ? new Date(c.data.created_utc * 1000).toISOString() : null,
        score: c.data?.score,
        permalink: c.data?.permalink ? `https://reddit.com${c.data.permalink}` : null,
        body: c.data?.body
      })),
      posts: posts.map(p => ({
        id: p.data?.name || p.id,
        subreddit: p.data?.subreddit,
        createdUtc: p.data?.created_utc,
        createdAt: p.data?.created_utc ? new Date(p.data.created_utc * 1000).toISOString() : null,
        score: p.data?.score,
        title: p.data?.title,
        permalink: p.data?.permalink ? `https://reddit.com${p.data.permalink}` : null,
        url: p.data?.url,
        selftext: p.data?.selftext
      }))
    };
  }

  /**
   * Compiles chat channels and direct messages into a clean JSON archive
   */
  static compileChatBackup(username, pms = [], channels = []) {
    return {
      exportedAt: new Date().toISOString(),
      username: username || 'reddit_user',
      metadata: {
        totalPMs: pms.length,
        totalChannels: channels.length,
        totalItems: pms.length + channels.length,
        version: '1.0.0'
      },
      directMessages: pms.map(pm => ({
        id: pm.id,
        author: pm.author,
        recipient: pm.recipient,
        subject: pm.subject,
        body: pm.body,
        createdUtc: pm.createdUtc,
        createdAt: pm.createdUtc ? new Date(pm.createdUtc * 1000).toISOString() : null,
        isAuthor: pm.isAuthor
      })),
      chatChannels: channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        type: ch.type || 'direct',
        memberCount: ch.memberCount || 2,
        lastMessageAt: ch.lastMessageAt || null,
        lastAuthor: ch.lastAuthor || null
      }))
    };
  }

  /**
   * Triggers client-side browser download for JSON archive
   */
  static downloadJson(backupData, filename = null) {
    if (typeof window === 'undefined' || !document || !document.createElement) {
      return filename || 'backup.json';
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const rawUsername = backupData.username || 'user';
    const safeUsername = rawUsername.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Math.floor(Date.now() / 1000);
    const finalFilename = filename || `untrace_reddit_backup_${safeUsername}_${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return finalFilename;
  }
}
