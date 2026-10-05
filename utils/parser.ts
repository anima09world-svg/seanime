import { getBaseUrl, getArchiveUrl, SELECTORS, HEADERS } from "./constants";
import { extractEpisodeInfoFromUrl, extractTitleFromUrl } from "./normalizer";

// Types from core.d.ts and onlinestream-provider.d.ts
export class Parser {
    
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
            
            // Skip if it doesn't look valid
            if (!title || !url) return;
            
            // For ToonWorld4All, it's mostly dubs, so we assume dub
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
        
        // Use a Set to avoid duplicate episode URLs
        const seenUrls = new Set<string>();
        
        links.Each((_i: number, s: any) => {
            const epUrl = s.Attr("href");
            if (!epUrl || seenUrls.has(epUrl)) return;
            seenUrls.add(epUrl);
            
            const { season, episode } = extractEpisodeInfoFromUrl(epUrl);
            const title = extractTitleFromUrl(epUrl);
            
            episodes.push({
                id: epUrl, // use the episode URL as ID for findEpisodeServer
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
        
        // Find the window.__PROPS__ JSON data
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
        
        // 1. Add direct streams if available
        if (data.streams && Array.isArray(data.streams)) {
            for (const stream of data.streams) {
                if (stream.play) {
                    const langs = (stream.languages || []).map((l: any) => l.large || l.code).join(", ");
                    videoSources.push({
                        url: stream.play,
                        type: "unknown", // Usually handled automatically or needs specific player
                        quality: "Auto",
                        label: langs || "Multi-Audio",
                        subtitles: []
                    });
                }
            }
        }
        
        // 2. Add download encodes as sources (often they are streamable if it's hubcloud)
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
