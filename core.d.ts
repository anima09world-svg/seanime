// Minimal types to satisfy the IDE.
// In the actual Seanime runtime, these are provided globally.

declare function LoadDoc(html: string): any;
declare function $getUserPreference(key: string): string | undefined;

declare namespace $app {
    interface AnimeProvider {
        getSettings(): Settings;
        search(opts: SearchOptions): Promise<SearchResult[]>;
        findEpisodes(id: string): Promise<EpisodeDetails[]>;
        findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer>;
    }

    interface Settings {
        episodeServers: string[];
        supportsDub: boolean;
    }

    interface SearchOptions {
        query: string;
    }

    interface SearchResult {
        id: string;
        title: string;
        url: string;
        subOrDub: "sub" | "dub" | "both";
    }

    interface EpisodeDetails {
        id: string;
        number: number;
        url: string;
        title: string;
    }

    interface EpisodeServer {
        server: string;
        headers?: Record<string, string>;
        videoSources: VideoSource[];
    }

    interface VideoSource {
        url: string;
        type: string;
        quality: string;
        label: string;
        subtitles: any[];
    }
}
