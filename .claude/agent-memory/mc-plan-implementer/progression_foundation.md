---
name: progression-foundation
description: M7 phase A pitfalls - stat provider registry, tsx schema decorators, client title wiring, hidden-pane browser checks
metadata:
  type: project
---

- Stat bonuses: add a class to `PROVIDER_CLASSES` in `server/src/modules/stats/stats.module.ts` (token `STAT_BONUS_PROVIDERS` is a factory array). Providers read models/GameData only; schema files of other modules may be imported there without importing the module.
- tsx does not emit decorator metadata: every `@Prop` in a schema needs an explicit `type`, and unit tests must not import schema files (put pure helpers in `*-rules.ts`).
- `onUPP` is merged with `Object.assign` by QuestController: send whole sub-maps (`currencies`), never partial ones. Shared `package.json` test script lists test files explicitly: add new shared tests there.
- Client `GameScene.ts` is over its cap: hook features through `CharacterController` (owns TitleController) and `entityOf`. Nameplates draw under the feet (title above the name).
- Scripted e2e: `bot.mjs` in the session scratchpad (global WebSocket, register/login/newChar/chooseCharactor/sceneLogin); browser: type chat commands with a real click on the chat input + `key Return`, C key needs `document.activeElement.blur()` first.
