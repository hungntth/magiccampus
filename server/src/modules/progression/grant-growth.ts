// gmGrant kinds of M13 phase E2 (test sources, the systems have no income in H5 yet): `medal <id> <n>` (a stack in the medal bag + updateMedalInBag),
// `medalexp <n>` (medal exp in the medal state), `heart <id> <n>` (creatureh_heart id into the Ma Tâm bag + updateMonsterHeartBagByType) and
// `prschip <id> <n>` (Mảnh Thần Dụ into the Chân Hồn Thần Thú chip bag + updatePRSChipBag, M13 G) and `fairy <tid>` (a Tiểu Tinh Linh of that
// template, one per template, + onAddFairy, M13 G).
// Pure state functions + the feature store only (ProgressionModule cannot import the medal / monster heart modules).

import { FAIRY_TEXT, dayKey, type GmGrantResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { FAIRY_FEATURE_KEY, encodeFairyState, fairyWire, newFairy, nextFairyId, parseFairyState } from '../fairy/fairy-state';
import { addMedal, isError } from '../medal/medal-rules';
import { MEDAL_FEATURE_KEY, encodeMedal, parseMedal } from '../medal/medal-state';
import { MONSTER_HEART_FEATURE_KEY, addToBag, encodeMonsterHeart, parseMonsterHeart } from '../monsterheart/monsterheart-state';
import { applyDraws, isError as isPrsError } from '../prs/prs-rules';
import { PRS_FEATURE_KEY, encodePrs, parsePrs } from '../prs/prs-state';
import { FeatureStoreService } from './feature-store.service';

export async function grantGrowth(
  session: Session, store: FeatureStoreService, gameData: GameDataService, kind: 'medal' | 'medalexp' | 'heart' | 'prschip' | 'fairy', id: number, n: number,
): Promise<GmGrantResult> {
  const cid = session.characterId!;
  if (!Number.isInteger(n) || n < 1 || n > 99_999) throw RpcException.invalidArgs('n');
  if (kind === 'medalexp') {
    const exp = await withCharLock(cid, async () => {
      const s = parseMedal(await store.get(cid, MEDAL_FEATURE_KEY, {}));
      s.exp += n;
      await store.put(cid, MEDAL_FEATURE_KEY, encodeMedal(s));
      return s.exp;
    });
    return { kind, id: 'medalExp', n, total: exp, note: `medal exp +${n} = ${exp}` };
  }
  if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('id');
  if (kind === 'fairy') {
    const tpl = gameData.fairyTemplate(id);
    if (!tpl) throw RpcException.notFound(`fairy template ${id} not found`);
    const f = await withCharLock(cid, async () => {
      const s = parseFairyState(await store.get(cid, FAIRY_FEATURE_KEY, {}));
      if ([...s.fairies.values()].some((x) => x.tid === id)) throw RpcException.forbidden(FAIRY_TEXT.ALREADY_OWNED);
      const made = newFairy(nextFairyId(s), tpl, dayKey(Date.now()));
      s.fairies.set(made.id, made);
      await store.put(cid, FAIRY_FEATURE_KEY, encodeFairyState(s));
      return fairyWire(made);
    });
    session.callback('onAddFairy', f);
    return { kind, id: String(id), n: 1, note: `fairy ${id} (${tpl.name}) as #${f.id}` };
  }
  if (kind === 'medal') {
    const row = gameData.medal(id);
    if (!row || row.sid === 1006 || row.sid === 2006) throw RpcException.notFound(`medal ${id} not found`);
    const entry = await withCharLock(cid, async () => {
      const res = addMedal(parseMedal(await store.get(cid, MEDAL_FEATURE_KEY, {})), id, n);
      if (isError(res)) throw RpcException.forbidden(res.error);
      await store.put(cid, MEDAL_FEATURE_KEY, encodeMedal(res.state));
      return { i: res.slot, t: id, n: res.state.bag[res.slot]!.n };
    });
    session.callback('updateMedalInBag', entry);
    return { kind, id: String(id), n, note: `medal ${id} (${row.name}) x${n} in slot ${entry.i}` };
  }
  if (kind === 'prschip') {
    const chip = gameData.prsChip(id);
    if (!chip) throw RpcException.notFound(`prs chip ${id} not found`);
    const bag = await withCharLock(cid, async () => {
      const res = applyDraws(parsePrs(await store.get(cid, PRS_FEATURE_KEY, {})), Array<number>(n).fill(id));
      if (isPrsError(res)) throw RpcException.forbidden(res.error);
      await store.put(cid, PRS_FEATURE_KEY, encodePrs(res.state));
      return res.state.chipBag;
    });
    session.callback('updatePRSChipBag', bag);
    return { kind, id: String(id), n, note: `prs chip ${id} (${chip.name}) x${n}` };
  }
  const heart = gameData.heart(id);
  if (!heart) throw RpcException.notFound(`heart ${id} not found`);
  const bag = await withCharLock(cid, async () => {
    const s = parseMonsterHeart(await store.get(cid, MONSTER_HEART_FEATURE_KEY, {}));
    if (!addToBag(s, heart.type, id, n)) throw RpcException.forbidden('heart type has no bag');
    await store.put(cid, MONSTER_HEART_FEATURE_KEY, encodeMonsterHeart(s));
    return s.bag;
  });
  session.callback('updateMonsterHeartBagByType', bag, heart.type);
  return { kind, id: String(id), n, note: `heart ${id} (${heart.name}) x${n}` };
}
