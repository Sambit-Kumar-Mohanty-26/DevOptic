interface Bookmark {
    id: string;
    url: string;
    title: string;
    folder: string;
    createdAt: Date;
    favicon?: string;
}

const bookmarkStore: Map<string, Bookmark[]> = new Map();

export const BookmarkManager = {
    addBookmark(sessionId: string, url: string, title: string, folder: string = 'Other', favicon?: string): Bookmark {
        if (!bookmarkStore.has(sessionId)) {
            bookmarkStore.set(sessionId, []);
        }

        const bookmarks = bookmarkStore.get(sessionId)!;

        const existing = bookmarks.find(b => b.url === url);
        if (existing) {
            existing.title = title;
            existing.folder = folder;
            return existing;
        }

        const bookmark: Bookmark = {
            id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title,
            folder,
            createdAt: new Date(),
            favicon
        };

        bookmarks.push(bookmark);
        return bookmark;
    },

    getBookmarks(sessionId: string): Bookmark[] {
        return bookmarkStore.get(sessionId) || [];
    },

    getBookmarksByFolder(sessionId: string, folder: string): Bookmark[] {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        return bookmarks.filter(b => b.folder === folder);
    },

    getFolders(sessionId: string): string[] {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        const folders = new Set<string>(bookmarks.map(b => b.folder));
        return ['Favorites', 'Other', ...Array.from(folders)].filter((v, i, a) => a.indexOf(v) === i);
    },

    updateBookmark(sessionId: string, id: string, updates: Partial<Pick<Bookmark, 'title' | 'folder'>>): Bookmark | null {
        const bookmarks = bookmarkStore.get(sessionId);
        if (!bookmarks) return null;

        const bookmark = bookmarks.find(b => b.id === id);
        if (!bookmark) return null;

        if (updates.title !== undefined) bookmark.title = updates.title;
        if (updates.folder !== undefined) bookmark.folder = updates.folder;

        return bookmark;
    },

    deleteBookmark(sessionId: string, id: string): boolean {
        const bookmarks = bookmarkStore.get(sessionId);
        if (!bookmarks) return false;

        const index = bookmarks.findIndex(b => b.id === id);
        if (index === -1) return false;

        bookmarks.splice(index, 1);
        return true;
    },

    isBookmarked(sessionId: string, url: string): boolean {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        return bookmarks.some(b => b.url === url);
    },

    searchBookmarks(sessionId: string, query: string): Bookmark[] {
        const bookmarks = bookmarkStore.get(sessionId) || [];
        const lowerQuery = query.toLowerCase();

        return bookmarks.filter(b =>
            b.title.toLowerCase().includes(lowerQuery) ||
            b.url.toLowerCase().includes(lowerQuery)
        );
    },
    destroySession(sessionId: string): void {
        bookmarkStore.delete(sessionId);
    }
};

export default BookmarkManager;
