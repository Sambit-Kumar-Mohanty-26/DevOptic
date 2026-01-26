/**
 * History Manager - Manages browsing history for server-side browser sessions
 */

interface HistoryEntry {
    id: string;
    url: string;
    title: string;
    visitedAt: Date;
    favicon?: string;
}

// In-memory history storage (per session)
const historyStore: Map<string, HistoryEntry[]> = new Map();
const MAX_HISTORY_ENTRIES = 1000;

export const HistoryManager = {
    /**
     * Add a new history entry
     */
    addEntry(sessionId: string, url: string, title: string, favicon?: string): HistoryEntry {
        if (!historyStore.has(sessionId)) {
            historyStore.set(sessionId, []);
        }

        const history = historyStore.get(sessionId)!;

        // Don't add duplicate consecutive entries
        if (history.length > 0 && history[0].url === url) {
            // Update title if changed
            history[0].title = title;
            history[0].visitedAt = new Date();
            return history[0];
        }

        const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title,
            visitedAt: new Date(),
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
    getHistory(sessionId: string, limit: number = 100): HistoryEntry[] {
        const history = historyStore.get(sessionId) || [];
        return history.slice(0, limit);
    },

    /**
     * Search history
     */
    searchHistory(sessionId: string, query: string, limit: number = 50): HistoryEntry[] {
        const history = historyStore.get(sessionId) || [];
        const lowerQuery = query.toLowerCase();

        return history
            .filter(entry =>
                entry.title.toLowerCase().includes(lowerQuery) ||
                entry.url.toLowerCase().includes(lowerQuery)
            )
            .slice(0, limit);
    },

    /**
     * Delete a single entry
     */
    deleteEntry(sessionId: string, entryId: string): boolean {
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
    clearHistory(sessionId: string): void {
        historyStore.set(sessionId, []);
    },

    /**
     * Clean up history for a destroyed session
     */
    destroySession(sessionId: string): void {
        historyStore.delete(sessionId);
    },

    /**
     * Get recently closed tabs (last entries before navigation away)
     */
    getRecentlyClosed(sessionId: string, limit: number = 10): HistoryEntry[] {
        const history = historyStore.get(sessionId) || [];
        // Return unique URLs from recent history
        const seen = new Set<string>();
        const recent: HistoryEntry[] = [];

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
