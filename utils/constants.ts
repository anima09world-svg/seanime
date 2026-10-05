export const BASE_URL = "https://toonworld4all.me";
export const ARCHIVE_URL = "https://archive.toonworld4all.me";

export const SELECTORS = {
    SEARCH_ITEM: "article.post",
    SEARCH_TITLE: "h2.entry-title a",
    SEARCH_LINK: "h2.entry-title a",
    SEARCH_IMAGE: ".herald-post-thumbnail img",
    
    // In anime details page
    EPISODE_LINK: "a[href*='archive.toonworld4all.me/episode/']",
};

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};
