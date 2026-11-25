# Recur (working name)

Drop the transaction file from your Canadian bank into a web page and see every recurring charge you are paying, what it costs per year, and one clean, merged CSV. Everything runs in your browser: no bank login, no upload, no account, no tracking.

CSV exports come first; verified PDF statement parsing follows.

**Status:** in development (milestone M1). Not usable yet.

- Requirements: [docs/PRD.md](docs/PRD.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Roadmap and progress: [docs/ROADMAP.md](docs/ROADMAP.md), [docs/PROGRESS.md](docs/PROGRESS.md)

## Credits

- Brand names for the transaction readout come from the OpenStreetMap [name-suggestion-index](https://github.com/osmlab/name-suggestion-index) (BSD 3-Clause, Copyright (c) 2018 Bryan Housel and contributors), filtered into `src/core/merchant/brands.ts` by `npm run brands:build`.

## Licence

MIT. See [LICENSE](LICENSE).
