# ToonWorld4All Seanime Extension

A Seanime provider extension for scraping anime from [ToonWorld4All](https://toonworld4all.me/). It extracts multi-audio, dual-audio, Hindi, Tamil, Telugu, and English anime streams and downloads.

**Author:** displaygamer

## Features

- Supports Anime search through ToonWorld4All.
- Extracts episode listings dynamically from blog posts.
- Resolves video stream/download links and presents them based on quality (480p, 720p, 1080p).
- Fetches all available audio tracks information natively.

## Project Structure

- `manifest.json`: Defines extension metadata and supported languages.
- `code.ts`: The main provider entry point exposing `search`, `findEpisodes`, and `findEpisodeServer`.
- `utils/parser.ts`: HTML DOM parsing logic and payload fetching.
- `utils/normalizer.ts`: Helper methods for matching strings and building sane metadata.
- `utils/constants.ts`: Global base paths, API headers, and DOM selectors.

## Note on Video Sources

This provider extracts raw Cloudflare Pages embed links (`*.pages.dev/play/...`) and download host links (HubCloud, GDFlix, Mega). If direct streaming relies on Cloudflare verification, Seanime's player will try its best to render `type: "unknown"` sources, though some HubCloud links are downloads only.
