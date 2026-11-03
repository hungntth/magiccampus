---
name: nest-game-server
description: "Use for any change to the mc-game-new NestJS game server (server/): adding or fixing @Rpc handlers, server pushes/broadcasts, feature modules and services, Mongoose schemas, GameDataService accessors over data_tbl_* collections, session/scene logic, seed/data tools under server/tools. Triggers: \"add RPC\", \"new server push\", \"fix server bug\", \"add a schema field\", \"read data_tbl_x\", \"thêm RPC\", \"sửa lỗi server\"."
argument-hint: "The server task, affected feature/module, and RPC or push names involved."
user-invocable: true
---

# NestJS Game Server

Server conventions for `server/` (NestJS 11, CommonJS, Mongoose, raw `ws`). `CLAUDE.md` is
authoritative; this skill is the how-to.

## Request path

`client.call(m, ...a)` → ws frame `{t:'call',id,m,a}` → `GameGateway.onMessage` (JSON check, logging
unless `quiet`) → `RpcRegistry.dispatch` (auth/character gating from decorator options) → your
`@Rpc` method `(session, args)` → return value becomes `{t:'res',ok:true,r}`; a thrown
`RpcException` becomes `{ok:false,e:{code,msg}}`; any other error is logged with stack and returned as
`INTERNAL`.

Pushes: `session.callback('onXxx', ...args)` (one client), `scenes.broadcast(mapId, 'onXxx', [args],
exclude?)` (a map), `scenes.broadcastAll('onXxx', [args], exclude?)` (everyone).

## Adding a feature module

```
server/src/modules/<feature>/
  <feature>.module.ts    // MongooseModule.forFeature([...]), imports GameDataModule etc., providers
  <feature>.rpc.ts       // @Injectable() class with @Rpc methods — thin
  <feature>.service.ts   // logic + persistence, exported if other modules need it
  <thing>.schema.ts      // @Schema classes for runtime/player state
```

Then add the module to `imports` in `server/src/app.module.ts`. `GatewayModule` is `@Global`, so
`SceneManager`, `GameGateway` and `RpcRegistry` can be injected anywhere without importing it.

### RPC file pattern

```ts
// Daily sign-in RPCs: getSignInfo, signIn. Push: onSignIn (self).

import { Injectable } from '@nestjs/common';
import type { SignInfo } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { SignInService } from './signin.service';

@Injectable()
export class SignInRpc {
  constructor(private readonly signIn: SignInService) {}

  @Rpc('signIn', { requireCharacter: true })
  async signInToday(session: Session, args: unknown[]): Promise<SignInfo> {
    const day = Number(args[0]);
    if (!Number.isInteger(day) || day < 1) throw RpcException.invalidArgs('day');
    const info = await this.signIn.sign(session.characterId!, day);
    session.callback('onSignIn', info);
    return info;
  }
}
```

Rules:

- Name the RPC exactly as the Flash client did (`@Rpc('chooseCharactor')`); method names can be
  readable TypeScript.
- Args are `unknown[]`: `Number(...)` + `Number.isInteger`, `typeof x === 'string'`, trim/limit
  strings; throw `RpcException.invalidArgs('<field>')`. Other errors: `notFound`, `forbidden`,
  `alreadyExists`, `unauthorized`, or `new RpcException(code, msg)` with a code added to
  `ErrorCodes` in `@mc/shared`.
- Gating: `{ requireAuth: true }` for account-level, `{ requireCharacter: true }` for in-world.
  `session.characterId!` is safe after `requireCharacter`.
- **No `quiet: true` on new RPCs.** The gateway logs every un-quiet call; quiet a method only after
  the user confirms the feature works, and ask first. Already quiet: `getClassList`, `say`, `udcp`,
  `udcr`, `getMapList`.
- Return a shared type (or `null`). Never return Mongoose documents — map with a `toXxx()` function
  in the service (see `CharacterService.toPlayerData`).
- Re-registering an RPC name logs a warning and the last registration wins — grep `@Rpc('name'`
  before adding one.
- Need cleanup on disconnect? `this.gateway.onDisconnect(async (session) => …)` in `onModuleInit`
  (see `SceneRpc`).

### Service / persistence

- Inject models with `@InjectModel(Thing.name) private readonly things: Model<Thing>`.
- Schemas: `@Schema({ collection: '<plural>', timestamps: … })`, `@Prop({ default: … })` for every
  field so old documents read safely after adding fields; `HydratedDocument<T>` for doc types.
- Client-visible integer ids come from the `counters` collection (`findByIdAndUpdate(key,
  { $inc: { seq: 1 } }, { new: true, upsert: true })`, see `CharacterService.nextId`).
- Multi-step changes (spend + grant): spend first, check the result (e.g. conditional `updateOne`
  with `$inc` and a guard filter like `{ _id, money: { $gte: cost } }`), then grant; push only after
  writes succeed.
- Keep hot per-player state on the document; transient per-connection state on `Session` (add a field
  there only for connection-scoped data).

### Static game data

- `GameDataService` wraps the `data_tbl_*` collections (legacy names, snake_case columns, `_id` = legacy
  `id`). Hot tables are cached in `reload()` (`maps`, `classes`, `npcsByMap`); others via
  `rows(collection, filter)`.
- Add a typed accessor for each new table you need (cache it in `reload()` if it's read per request),
  and a `toXxx(row)` mapper to the shared type. Coerce columns explicitly (`Number(row.x ?? 0)`,
  `String(row.code ?? 0)`); resource codes stay strings.
- Missing data → tell the user to run `pnpm import:seeds` (optionally `--only data_tbl_x`); never
  patch `data_tbl_*` by hand.

## Workflow

1. Read `CLAUDE.md`, the matching `docs/memory/<feature>.md`, and the module you will touch.
2. If the behavior is ported from the old game and not yet specified, get the spec first
   (`legacy-server-researcher` / `flash-client-researcher`, or the `feature-pipeline` skill for whole
   features).
3. Shared types in `packages/shared/src/protocol.ts` → `pnpm --filter @mc/shared build`.
4. Schema → service → rpc → module wiring.
5. Tests for pure logic as `*.test.ts` next to the code (`node:test`, no Mongo).
6. `pnpm --filter @mc/server lint` and `pnpm -r test`; boot check with `pnpm dev:server` when Mongo is
   up (`Registered N RPC methods`).
7. Update `docs/memory/<feature>.md`.

## Completion checks

- Lint clean, tests green, server boots.
- Names match the Flash client; payloads are shared types used by the client too.
- New RPCs un-quieted; user reminded.
- Report: files changed, RPCs/pushes added, verification run, open risks.
