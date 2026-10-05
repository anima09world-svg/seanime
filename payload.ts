// constants
function getBaseUrl() {
    try {
        const v = $getUserPreference("baseUrl");
        if (v && v.trim().length > 0) return v.replace(/\/+$/, "");
    } catch (e) {}
    return "https://toonworld4all.me";
}

function getArchiveUrl() {
    try {
        const v = $getUserPreference("archiveUrl");
        if (v && v.trim().length > 0) return v.replace(/\/+$/, "");
    } catch (e) {}
    return "https://archive.toonworld4all.me";
}

const SELECTORS = {
    SEARCH_ITEM: "article.post",
    SEARCH_TITLE: "h2.entry-title a",
    SEARCH_LINK: "h2.entry-title a",
    SEARCH_IMAGE: ".herald-post-thumbnail img",
    EPISODE_LINK: "a[href*='/episode/'], a[href*='/movie/']",
};

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

// normalizer
function extractEpisodeInfoFromUrl(url: string): { season: number; episode: number } {
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

function extractTitleFromUrl(url: string): string {
    const parts = url.split('/');
    const lastPart = parts.filter(p => p.length > 0).pop();
    if (lastPart) {
        return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return "Unknown Title";
}

// parser
class Parser {
    
    async searchAnime(query: string): Promise<$app.SearchResult[]> {
        const searchUrl = `${getBaseUrl()}/?s=${encodeURIComponent(query)}`;
        const req = await fetch(searchUrl, { headers: HEADERS });
        if (!req.ok) {
            throw new Error(`Search failed: ${req.status}`);
        }
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const results: $app.SearchResult[] = [];
        const items = $(SELECTORS.SEARCH_ITEM);
        
        items.each((_i: number, el: any) => {
            const titleEl = $(el).find(SELECTORS.SEARCH_TITLE);
            let title = titleEl.text().trim();
            // Clean the title to help Seanime match it
            title = title.replace(/\s*(?:\(\d{4}\)|Season|BluRay|HD|Multi Audio|Dual Audio|Hindi|Tamil|Telugu|\[).*$/i, '').replace(/[\(\)-]+$/, '').trim();

            const url = titleEl.attr("href");
            
            if (!title || !url) return;
            
            results.push({
                id: url,
                title: title,
                url: url,
                subOrDub: "dub"
            });
        });
        
        return results;
    }
    
    async getEpisodes(url: string): Promise<$app.EpisodeDetails[]> {
        const req = await fetch(url, { headers: HEADERS });
        if (!req.ok) {
            throw new Error(`Failed to fetch episodes: ${req.status}`);
        }
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const episodes: $app.EpisodeDetails[] = [];
        const links = $(SELECTORS.EPISODE_LINK);
        
        const seenUrls = new Set<string>();
        
        links.each((_i: number, el: any) => {
            const epUrl = $(el).attr("href");
            // Skip non-archive links (e.g. /category/movie/)
            if (!epUrl || seenUrls.has(epUrl) || !epUrl.includes('archive.toonworld4all')) return;
            seenUrls.add(epUrl);
            
            const { season, episode } = extractEpisodeInfoFromUrl(epUrl);
            
            episodes.push({
                id: epUrl, 
                number: episode,
                url: epUrl,
                title: `Season ${season} Episode ${episode}`
            });
        });
        
        return episodes;
    }
    
    async extractVideoSources(episodeUrl: string): Promise<$app.EpisodeServer[]> {
        const req = await fetch(episodeUrl, { headers: HEADERS });
        if (!req.ok) {
            throw new Error(`Failed to fetch episode page: ${req.status}`);
        }
        const html = await req.text();
        
        const regex = /window\.__PROPS__\s*=\s*(\{.*?\})\s*;/s;
        const match = html.match(regex);
        if (!match) {
            throw new Error("Could not find episode data in page.");
        }
        
        const props = JSON.parse(match[1]);
        const data = props.data?.data;
        if (!data) {
            throw new Error("Invalid episode data format.");
        }
        
        const videoSources: $app.VideoSource[] = [];
        
        if (data.streams && Array.isArray(data.streams)) {
            for (const stream of data.streams) {
                if (stream.play) {
                    const langs = (stream.languages || []).map((l: any) => l.large || l.code).join(", ");
                    videoSources.push({
                        url: stream.play,
                        type: "unknown",
                        quality: "Auto",
                        label: langs || "Multi-Audio",
                        subtitles: []
                    });
                }
            }
        }
        
        if (data.encodes && Array.isArray(data.encodes)) {
            for (const encode of data.encodes) {
                const resolution = encode.resolution || "Unknown";
                const isHq = encode.is_hq ? " HQ" : "";
                
                if (encode.files && Array.isArray(encode.files)) {
                    for (const file of encode.files) {
                        if (file.link && file.host) {
                            const fileUrl = file.link.startsWith("http") 
                                ? file.link 
                                : `${getArchiveUrl()}${file.link}`;
                            
                            videoSources.push({
                                url: fileUrl,
                                type: "unknown",
                                quality: `${resolution}${isHq}`,
                                label: file.host,
                                subtitles: []
                            });
                        }
                    }
                }
            }
        }
        
        return [
            {
                server: "ToonWorld4All",
                headers: { "Referer": `${getArchiveUrl()}/` },
                videoSources: videoSources
            }
        ];
    }
}

// code.ts
class Provider implements $app.AnimeProvider {
    private parser = new Parser();

    getSettings(): $app.Settings {
        return { 
            episodeServers: ["ToonWorld4All"], 
            supportsDub: true 
        };
    }

    async search(opts: $app.SearchOptions): Promise<$app.SearchResult[]> {
        try {
            return await this.parser.searchAnime(opts.query);
        } catch (e: any) {
            throw String(e.message || e);
        }
    }

    async findEpisodes(id: string): Promise<$app.EpisodeDetails[]> {
        try {
            return await this.parser.getEpisodes(id);
        } catch (e: any) {
            throw String(e.message || e);
        }
    }

    async findEpisodeServer(episode: $app.EpisodeDetails, server: string): Promise<$app.EpisodeServer> {
        try {
            const servers = await this.parser.extractVideoSources(episode.id);
            if (servers.length > 0) {
                return servers[0];
            }
            throw "No video sources found for this episode.";
        } catch (e: any) {
            throw String(e.message || e);
        }
    }
}
