// src/onlinestream-provider/toonworld4all/utils/constants.ts
var BASE_URL = "https://toonworld4all.me";
var SELECTORS = {
  SEARCH_ITEM: "article.post",
  SEARCH_TITLE: "h2.entry-title a",
  SEARCH_LINK: "h2.entry-title a",
  SEARCH_IMAGE: ".herald-post-thumbnail img",
  EPISODE_LINK: "a[href*='archive.toonworld4all.me/episode/']",
};
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

// src/onlinestream-provider/toonworld4all/utils/normalizer.ts
function extractEpisodeInfoFromUrl(url) {
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
function extractTitleFromUrl(url) {
  const parts = url.split("/");
  const lastPart = parts.filter((p) => p.length > 0).pop();
  if (lastPart) {
    return lastPart.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
  return "Unknown Title";
}

// src/onlinestream-provider/toonworld4all/utils/parser.ts
class Parser {
  async searchAnime(query) {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const req = await fetch(searchUrl, { headers: HEADERS });
    if (!req.ok) {
      throw new Error(`Search failed: ${req.status}`);
    }
    const html = await req.text();
    const doc = LoadDoc(html);
    const results = [];
    const items = doc.Find(SELECTORS.SEARCH_ITEM);
    items.Each((_i, s) => {
      const titleEl = s.Find(SELECTORS.SEARCH_TITLE);
      const title = titleEl.Text().trim();
      const url = titleEl.Attr("href");
      if (!title || !url) return;
      results.push({
        id: url,
        title,
        url,
        subOrDub: "dub",
      });
    });
    return results;
  }
  async getEpisodes(url) {
    const req = await fetch(url, { headers: HEADERS });
    if (!req.ok) {
      throw new Error(`Failed to fetch episodes: ${req.status}`);
    }
    const html = await req.text();
    const doc = LoadDoc(html);
    const episodes = [];
    const links = doc.Find(SELECTORS.EPISODE_LINK);
    const seenUrls = new Set();
    links.Each((_i, s) => {
      const epUrl = s.Attr("href");
      if (!epUrl || seenUrls.has(epUrl)) return;
      seenUrls.add(epUrl);
      const { season, episode } = extractEpisodeInfoFromUrl(epUrl);
      const title = extractTitleFromUrl(epUrl);
      episodes.push({
        id: epUrl,
        number: episode,
        url: epUrl,
        title: `Season ${season} Episode ${episode}`,
      });
    });
    return episodes;
  }
  async extractVideoSources(episodeUrl) {
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
    const videoSources = [];
    if (data.streams && Array.isArray(data.streams)) {
      for (const stream of data.streams) {
        if (stream.play) {
          const langs = (stream.languages || [])
            .map((l) => l.large || l.code)
            .join(", ");
          videoSources.push({
            url: stream.play,
            type: "unknown",
            quality: "Auto",
            label: langs || "Multi-Audio",
            subtitles: [],
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
                : `https://archive.toonworld4all.me${file.link}`;
              videoSources.push({
                url: fileUrl,
                type: "unknown",
                quality: `${resolution}${isHq}`,
                label: file.host,
                subtitles: [],
              });
            }
          }
        }
      }
    }
    return [
      {
        server: "ToonWorld4All",
        headers: { Referer: "https://archive.toonworld4all.me/" },
        videoSources,
      },
    ];
  }
}

// src/onlinestream-provider/toonworld4all/code.ts
class Provider {
  parser = new Parser();
  getSettings() {
    return {
      episodeServers: ["ToonWorld4All"],
      supportsDub: true,
    };
  }
  async search(opts) {
    return this.parser.searchAnime(opts.query);
  }
  async findEpisodes(id) {
    return this.parser.getEpisodes(id);
  }
  async findEpisodeServer(episode, _server) {
    const servers = await this.parser.extractVideoSources(episode.id);
    if (servers.length > 0) {
      return servers[0];
    }
    throw new Error("No video sources found for this episode.");
  }
}
