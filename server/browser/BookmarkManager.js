const bookmarkStore = new Map();

export const BookmarkManager = {
    addBookmark(sessionId, url, title, folder = 'Other', favicon) {
        if (!bookmarkStore.has(sessionId)) {
            bookmarkStore.set(sessionId, []);
        }

        const bookmarks = bookmarkStore.get(sessionId);

        const existing = bookmarks.find(b => b.url === url);
        if (existing) {
            existing.title = title;
            existing.folder = folder;
            if (favicon) existing.favicon = favicon;
            return existing;
        }

        const bookmark = {
            id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title,
            folder,
            createdAt: new Date().toISOString(),
            favicon
        };

        bookmarks.push(bookmark);
        return bookmark;
    },

    getBookmarks(sessionId) {
        return bookmarkStore.get(sessionId) || [];
    },

    getBookmarksByFolder(sessionId, folder) {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        return bookmarks.filter(b => b.folder === folder);
    },

    getFolders(sessionId) {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        const folders = new Set(bookmarks.map(b => b.folder));
        return ['Favorites', 'Other', ...Array.from(folders)].filter((v, i, a) => a.indexOf(v) === i);
    },

    updateBookmark(sessionId, id, updates) {
        const bookmarks = bookmarkStore.get(sessionId);
        if (!bookmarks) return null;

        const bookmark = bookmarks.find(b => b.id === id);
        if (!bookmark) return null;

        if (updates.title !== undefined) bookmark.title = updates.title;
        if (updates.folder !== undefined) bookmark.folder = updates.folder;

        return bookmark;
    },

    deleteBookmark(sessionId, id) {
        const bookmarks = bookmarkStore.get(sessionId);
        if (!bookmarks) return false;

        const index = bookmarks.findIndex(b => b.id === id);
        if (index === -1) return false;

        bookmarks.splice(index, 1);
        return true;
    },

    isBookmarked(sessionId, url) {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        return bookmarks.some(b => b.url === url);
    },

    searchBookmarks(sessionId, query) {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        const lowerQuery = query.toLowerCase();

        return bookmarks.filter(b =>
            (b.title && b.title.toLowerCase().includes(lowerQuery)) ||
            (b.url && b.url.toLowerCase().includes(lowerQuery))
        );
    },

    destroySession(sessionId) {
        bookmarkStore.delete(sessionId);
    }
};

export default BookmarkManager;
