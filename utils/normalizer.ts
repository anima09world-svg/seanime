export function extractEpisodeInfoFromUrl(url: string): { season: number; episode: number } {
    // Example: https://archive.toonworld4all.me/episode/one-piece-22x1089
    // Match ...-seasonXepisode or ...-numberXnumber
    const regex = /(\d+)x(\d+)[^/]*$/i;
    const match = url.match(regex);
    if (match) {
        return {
            season: parseInt(match[1], 10),
            episode: parseInt(match[2], 10),
        };
    }
    return { season: 1, episode: 1 };
}

export function extractTitleFromUrl(url: string): string {
    const parts = url.split('/');
    const lastPart = parts.filter(p => p.length > 0).pop();
    if (lastPart) {
        return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return "Unknown Title";
}
