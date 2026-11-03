# Verification Checklist (Phase 4)

Run after the implementer reports done. Its report is a claim; everything below is independent
verification by the orchestrator.

## 1. Typecheck and tests

```powershell
pnpm --filter @mc/shared build     # only if packages/shared changed
pnpm -r lint                       # tsc --noEmit in shared, server, client, tools/swf
pnpm -r test                       # node:test via tsx
```

- Baseline (2026-11-03): lint clean in all 4 packages; tests: `@mc/shared` 4 passing, `@mc/server` 0
  tests. The deliverable is zero new lint errors and zero new failures. Update this baseline when it
  changes.
- If IDE diagnostics and `tsc` disagree, `tsc` wins.
- Check that new pure logic got `*.test.ts` coverage as the plan listed.

## 2. Contract spot-checks (read the code)

- [ ] Every new payload is a type in `@mc/shared`, used by both `server/` and `client/` (grep both).
- [ ] RPC/push names match plan §1 exactly, typos included.
- [ ] Push ordering matches plan §1.
- [ ] Handlers validate args and throw `RpcException.*`; no silent `return` where the client awaits data.
- [ ] Gating via `requireAuth` / `requireCharacter`, not ad-hoc checks.
- [ ] Spend-then-credit order for item/currency rewards; writes awaited before pushes that report them.
- [ ] Broadcast scope right (self `session.callback`, map `scenes.broadcast`, all `scenes.broadcastAll`),
      sender excluded when the legacy behavior excludes it.
- [ ] Static data read via `GameDataService`; resource codes carried as strings and decoded with
      `@mc/shared`.
- [ ] New modules imported in `server/src/app.module.ts`; client handlers unsubscribed on scene destroy
      (stored in the scene's `offs`).
- [ ] Header comments on new files, files under ~300 lines, no `any` / `@ts-ignore`.
- [ ] Nothing under `D:\mcgame` was modified.

## 3. Runtime check (when the stack is available)

```powershell
docker compose -f docker/docker-compose.yml up -d
pnpm dev:server    # expect "Registered N RPC methods" including the new names
pnpm dev:client
```

Watch the server log during the smoke test: new RPCs are un-quieted precisely so calls and errors show
up as `conn N -> method(args)` / `<- method ok|CODE`. Stop processes you started.

## 4. RPC logging (`quiet`)

- [ ] New `@Rpc` methods have no `quiet: true`.
- [ ] Remind the user; add `quiet: true` only after they confirm the feature works, and ask first.

## 5. Manual smoke test (user-driven)

Hand the user the plan's §5 steps as a short numbered list in their language: what to click in the H5
client, what should appear, which log lines to expect.

## 6. Record

- [ ] `docs/memory/<feature>.md` updated (or created + one-line link in
      `docs/PROJECT_KNOWLEDGE_BASE.md`; the index stays link-only).
- [ ] Plan amended where reality diverged; deferred items recorded in the memory doc.
- [ ] Final report: outcome first, then verification done, then what remains.
- [ ] No git commit/push — committing is the user's call.
