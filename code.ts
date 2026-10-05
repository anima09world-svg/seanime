import { Parser } from "./utils/parser";

export class Provider implements $app.AnimeProvider {
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
        // id is the ToonWorld4All post URL, e.g. https://toonworld4all.me/fullmetal-...
        return this.parser.getEpisodes(id);
    }

    async findEpisodeServer(episode: $app.EpisodeDetails, server: string): Promise<$app.EpisodeServer> {
        // episode.id is the archive.toonworld4all.me episode URL
        const servers = await this.parser.extractVideoSources(episode.id);
        if (servers.length > 0) {
            return servers[0];
        }
        throw new Error("No video sources found for this episode.");
    }
}
