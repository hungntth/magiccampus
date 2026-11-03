# mc-game-new — H5 port

Port of the `mcgame` Flash MMO to an HTML5 stack:

- `server/` — NestJS (TypeScript) game server, MongoDB, JSON over WebSocket.
- `client/` — Vite + PixiJS H5 client.
- `packages/shared/` — wire protocol types and the resource-code → asset-path decoder shared by both.
- `docker/` — MongoDB compose stack.

The old asset cache (`frontend/s/res` in the Flash repo, md5-named blobs) is reused as-is: the server
streams it from `ASSET_DIR` on `/res/<md5>`, and the client computes the md5 of the logical path.

## Quick start

```powershell
pnpm install
docker compose -f docker/docker-compose.yml up -d
copy server\.env.example server\.env           # edit ASSET_DIR / SEED_DIR if the Flash repo is elsewhere
pnpm --filter @mc/shared build
pnpm import:seeds                               # loads data_tbl_* from the old Postgres seed dumps into Mongo
pnpm dev:server                                 # http://localhost:4000  (ws://localhost:4000/ws)
pnpm dev:client                                 # http://localhost:5173
```

Register an account in the login screen, create a character, enter the world. Chat with Enter,
`/go <mapId>` teleports to another map's safe point.

## Protocol

Client → server: `{"t":"call","id":1,"m":"login","a":["user","<md5 pass>"]}`
Server → client: `{"t":"res","id":1,"ok":true,"r":{...}}` or `{"t":"cb","m":"onCR","a":[...]}`

RPC names follow the Flash client (`sendCharList`, `newChar`, `chooseCharactor`, `sceneLogin`,
`createChars`, `createNpcs`, `udcp`, `udcr`, `sceneChange`, `say`). Handlers are any provider method
decorated with `@Rpc('name', { requireAuth, requireCharacter, quiet })`.

## Assets

Characters, NPCs, mounts, equipment overlays and scene items are converted from the old SWFs into
PNG atlases + JSON (`client/public/sheets/`), and map walkability masks are extracted from
`MAP_HIT_NEW.swf`. See [docs/assets-pipeline.md](docs/assets-pipeline.md) for the TypeScript tools in
`tools/swf` and the formats.

```powershell
pnpm --filter @mc/server resmap                       # md5 -> logical path map from game data
cd tools/swf
pnpm swfscan -names ../../server/resmap.json
pnpm swfbatch -only creature,equip,effect,item,tile,scene
pnpm swfhit -sizes sizes.json -png
```

## Vertical slice implemented

login/register → character list/create/select → enter map (single-image and tiled maps) →
NPCs rendered from `data_tbl_npc` → click-to-move with movement broadcast to peers → local/global chat →
`/go` map change → kick on duplicate login.

Not ported yet: combat, items, quests, pets, guilds, everything else (see the Go server's
`internal/application/*` for the ~50 remaining domains). Vector-only SWFs (UI skins, some effects) are not converted yet; character animations come from the
converted sheets (see docs/assets-pipeline.md).
