// constants
function getBaseUrl() {
    try {
        const v = $getUserPreference("baseUrl");
        if (v && v.trim().length > 0) return v.replace(/\/+$/, "");
    } catch (e) {}
    return "https://watchanimeworld.one";
}

const SELECTORS = {
    SEARCH_ITEM: "article.post, article.item",
    SEARCH_TITLE: ".entry-title",
    SEARCH_LINK: "a.lnk-blk, a[rel='bookmark']",
    EPISODE_ITEM: "article.episodes",
    EPISODE_LINK: "a.lnk-blk",
    EPISODE_NUMBER: ".num-epi",
    EPISODE_TITLE: ".entry-title"
};

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

// normalizer
function extractEpisodeInfo(url: string, title: string): { season: number; episode: number } | null {
    const input = decodeURIComponent(url + " " + title);
    let match = input.match(/(?:^|[^\d])(\d{1,2})x(\d{1,4})(?:[^\d]|$)/i);
    if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };

    match = input.match(/s(?:eason)?\s*0*(\d+)\D+e(?:p(?:isode)?)?\s*0*(\d+)/i);
    if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };

    match = input.match(/(?:episode|ep)\s*[-:#.]?\s*0*(\d+(?:\.\d+)?)/i);
    if (match) return { season: 1, episode: Math.floor(parseFloat(match[1])) };

    return null;
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
        
        items.each((_i: number, s: any) => {
            const titleEl = s.find(SELECTORS.SEARCH_TITLE);
            let title = titleEl.text().trim();
            // Clean the title to help Seanime match it
            title = title.replace(/\s*(?:\(\d{4}\)|Season|BluRay|HD|Multi Audio|Dual Audio|Hindi|Tamil|Telugu|\[).*$/i, '').replace(/[\(\)-]+$/, '').trim();

            const url = s.find(SELECTORS.SEARCH_LINK).attr("href");
            
            // Skip episodes in search results if they show up
            if (!title || !url || url.includes('/episode/')) return;
            
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
        const items = $(SELECTORS.EPISODE_ITEM);
        
        const seenUrls = new Set<string>();
        
        items.each((_i: number, s: any) => {
            const epUrl = s.find(SELECTORS.EPISODE_LINK).attr("href");
            if (!epUrl || seenUrls.has(epUrl)) return;
            seenUrls.add(epUrl);
            
            const numStr = s.find(SELECTORS.EPISODE_NUMBER).text().trim();
            const epTitle = s.find(SELECTORS.EPISODE_TITLE).text().trim();
            
            const info = extractEpisodeInfo(epUrl, numStr + " " + epTitle);
            if (!info) return;
            const { season, episode } = info;
            
            episodes.push({
                id: epUrl, 
                number: episode,
                url: epUrl,
                title: epTitle || `Season ${season} Episode ${episode}`
            });
        });
        
        // Reverse because usually they are listed newest first, Seanime likes oldest first
        return episodes.reverse();
    }
    
    async extractVideoSources(episodeUrl: string): Promise<$app.EpisodeServer[]> {
        const req = await fetch(episodeUrl, { headers: HEADERS });
        if (!req.ok) {
            throw new Error(`Failed to fetch episode page: ${req.status}`);
        }
        const html = await req.text();
        const $ = LoadDoc(html);
        
        const iframeSrc = $('iframe[src*="/dub-player/"]').attr('src');
        if (!iframeSrc) {
            throw new Error("Could not find video player iframe.");
        }
        
        let embedUrl: string;
        try {
            embedUrl = new URL(iframeSrc, episodeUrl).toString();
        } catch (_) {
            throw new Error("Invalid video player iframe URL.");
        }
        
        const embedReq = await fetch(embedUrl, { headers: { ...HEADERS, "Referer": episodeUrl }});
        if (!embedReq.ok) {
            throw new Error(`Player request failed: ${embedReq.status}`);
        }
        const embedHtml = await embedReq.text();
        
        // Look for var CONFIG = {...}
        const configMatch = embedHtml.match(/var\s+CONFIG\s*=\s*(\{.*?\});/);
        if (!configMatch) {
            throw new Error("Could not find AbyssPlayer config in embed.");
        }
        
        let config;
        try {
            config = JSON.parse(configMatch[1]);
        } catch(e) {
            throw new Error("Failed to parse player config.");
        }
        
        const servers: $app.EpisodeServer[] = [];
        
        if (config.ready && typeof config.ready === 'object') {
            for (const langKey of Object.keys(config.ready)) {
                const videoId = config.ready[langKey];
                const langName = config.lang && config.lang[langKey] ? config.lang[langKey].name : langKey;
                if (!config.prefix || !videoId) continue;
                const streamUrl = String(config.prefix) + String(videoId);
                const cleanUrl = streamUrl.split("?")[0].toLowerCase();
                let sourceType = "unknown";
                if (cleanUrl.endsWith(".m3u8")) sourceType = "m3u8";
                else if (cleanUrl.endsWith(".mp4")) sourceType = "mp4";
                
                servers.push({
                    server: `AbyssPlayer (${langName})`,
                    headers: {
                        "Referer": embedUrl,
                        "Origin": new URL(embedUrl).origin,
                        "User-Agent": HEADERS["User-Agent"]
                    },
                    videoSources: [{
                        url: streamUrl,
                        type: sourceType,
                        quality: "auto",
                        label: langName,
                        subtitles: []
                    }]
                });
            }
        }
        
        if (servers.length === 0) {
            throw new Error("No ready streams found in config.");
        }
        
        return servers;
    }
}

// code.ts
class Provider implements $app.AnimeProvider {
    private parser = new Parser();

    getSettings(): $app.Settings {
        return { 
            episodeServers: ["AbyssPlayer (Hindi)", "AbyssPlayer (Tamil)", "AbyssPlayer (Telugu)", "AbyssPlayer (Malayalam)", "AbyssPlayer (Bengali)", "AbyssPlayer (English)", "AbyssPlayer (Japanese)"], 
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
            // Since there can be multiple languages, try to match the requested server name
            for (const srv of servers) {
                if (srv.server === server) {
                    return srv;
                }
            }
            if (server === "default" && servers.length > 0) {
                return servers[0];
            }
            if (servers.length > 0) {
                throw new Error(`Requested server "${server}" is unavailable for this episode.`);
            }
            throw new Error("No video sources found for this episode.");
        } catch (e: any) {
            throw String(e.message || e);
        }
    }
}
