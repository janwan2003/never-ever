# Fess Up

Never have I ever for group chats: one link, sealed answers, a group reveal. Live at
https://pb-never-ever.jan-bef.workers.dev (product page: https://janwan2003.github.io/never-ever/).

- `src/worker.js`: Cloudflare Worker (static assets from `public/`, `/api/*`, `/r/<id>` pages with live link previews)
- `src/store.js`: one SQLite-backed Durable Object storing rounds, players and answers; sealing is enforced here
- `public/game.js`: reveal logic (lines, awards, surprises), shared by browser and tests
- `public/packs.js`: 12 original PG-13 packs

```
pnpm install
pnpm dev                                   # http://127.0.0.1:8987
pnpm test:unit
BASE=http://127.0.0.1:8987 pnpm test:e2e   # real Chromium, screenshots in shots/
pnpm deploy                                # needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
```
