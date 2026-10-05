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
    EPISODE_LINK: "a[href*='/episode/']",
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
        const doc = LoadDoc(html);
        
        const results: $app.SearchResult[] = [];
        const items = doc.Find(SELECTORS.SEARCH_ITEM);
        
        items.Each((_i: number, s: any) => {
            const titleEl = s.Find(SELECTORS.SEARCH_TITLE);
            const title = titleEl.Text().trim();
            const url = titleEl.Attr("href");
            
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
        const doc = LoadDoc(html);
        
        const episodes: $app.EpisodeDetails[] = [];
        const links = doc.Find(SELECTORS.EPISODE_LINK);
        
        const seenUrls = new Set<string>();
        
        links.Each((_i: number, s: any) => {
            const epUrl = s.Attr("href");
            if (!epUrl || seenUrls.has(epUrl)) return;
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
        return this.parser.searchAnime(opts.query);
    }

    async findEpisodes(id: string): Promise<$app.EpisodeDetails[]> {
        return this.parser.getEpisodes(id);
    }

    async findEpisodeServer(episode: $app.EpisodeDetails, server: string): Promise<$app.EpisodeServer> {
        const servers = await this.parser.extractVideoSources(episode.id);
        if (servers.length > 0) {
            return servers[0];
        }
        throw new Error("No video sources found for this episode.");
    }
}
