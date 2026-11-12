---
name: m13-rune-deco
description: M13 E1 deco + rune wiring, smoke recipe and pitfalls (hidden browser pane freezes Pixi, mongosh cursor map, heredoc quoting)
metadata:
  type: project
---

- `modules/deco` (state `deco`, pure rules) and `modules/rune` (RuneModule imports DecoModule + PetModule, registers `RunePetService` on PetStatRegistry); AppearanceService reads the `deco` feature itself and exposes `pushDeco`. Stat providers live in `stats/feature-providers.ts` and import only pure files.
- ws smoke: copy the wing smoke Bot class; mongosh `find().map()` returns a cursor, use `.toArray().map()` or cleanup silently fails; strip `mcgame> ` from mongosh output. Rune `qulity` green = 2.
- Browser: pane hidden => requestAnimationFrame never fires (javascript_tool promise on rAF times out, Pixi never repaints): effect layers cannot be seen, DOM windows work. `rep.cjs` (CRLF-safe replace driven by a JSON spec) beats `node -e` for CRLF files (AvatarView, AppearanceController, CharacterController).
- Heredocs with apostrophes / Vietnamese in bash fail to parse: use the Write tool.
