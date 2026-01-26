/**
 * History Manager - Manages browsing history for server-side browser sessions
 */

// In-memory history storage (per session)
const historyStore = new Map();
const MAX_HISTORY_ENTRIES = 1000;

export const HistoryManager = {
    /**
     * Add a new history entry
     */
    addEntry(sessionId, url, title, favicon) {
        if (!historyStore.has(sessionId)) {
            historyStore.set(sessionId, []);
        }

        const history = historyStore.get(sessionId);

        // Don't add duplicate consecutive entries
        if (history.length > 0 && history[0].url === url) {
            // Update title if changed
            history[0].title = title || history[0].title;
            history[0].visitedAt = new Date().toISOString();
            if (favicon) history[0].favicon = favicon;
            return history[0];
        }

        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title: title || url,
            visitedAt: new Date().toISOString(),
            favicon
        };

        // Add to front
        history.unshift(entry);

        // Trim to max size
        if (history.length > MAX_HISTORY_ENTRIES) {
            history.pop();
        }

        return entry;
    },

    /**
     * Get history for a session
     */
    getHistory(sessionId, limit = 100) {
        const history = historyStore.get(sessionId) || [];
        return history.slice(0, limit);
    },

    /**
     * Search history
     */
    searchHistory(sessionId, query, limit = 50) {
        const history = historyStore.get(sessionId) || [];
        const lowerQuery = query.toLowerCase();

        return history
            .filter(entry =>
                (entry.title && entry.title.toLowerCase().includes(lowerQuery)) ||
                (entry.url && entry.url.toLowerCase().includes(lowerQuery))
            )
            .slice(0, limit);
    },

    /**
     * Delete a single entry
     */
    deleteEntry(sessionId, entryId) {
        const history = historyStore.get(sessionId);
        if (!history) return false;

        const index = history.findIndex(e => e.id === entryId);
        if (index === -1) return false;

        history.splice(index, 1);
        return true;
    },

    /**
     * Clear all history for a session
     */
    clearHistory(sessionId) {
        historyStore.set(sessionId, []);
    },

    /**
     * Clean up history for a destroyed session
     */
    destroySession(sessionId) {
        historyStore.delete(sessionId);
    },

    /**
     * Get recently closed tabs (last entries before navigation away)
     */
    getRecentlyClosed(sessionId, limit = 10) {
        const history = historyStore.get(sessionId) || [];
        // Return unique URLs from recent history
        const seen = new Set();
        const recent = [];

        for (const entry of history) {
            if (!seen.has(entry.url)) {
                seen.add(entry.url);
                recent.push(entry);
                if (recent.length >= limit) break;
            }
        }

        return recent;
    }
};

export default HistoryManager;
