// Mê Trận RPCs (Flash names verbatim): getMazePreDate, refreshMaze, enterMaze, getMazeData, mazeConfirm, mazeSkip, mazeBuySkipNum,
// mazeBuyRecoverNum, mazeLeave, mazeRecover, answerMazeQuestion, getMazeShopItem, buyMazeShopItem, mazeDrop, getMazeLottery.
// Pushes (MazePush, fixed order): updateMazeInfoData, upMazeBuff, showMazeDiscPanel, showMazeQuestionPanel, showMazeShopPanel,
// showMazeLotteryPanel, leaveMaze (+ onSceneEnter room reloads, onSystemMidMsgOrNote toasts). State-returning RPCs reply the full state.

import { Injectable } from '@nestjs/common';
import type {
  MazeAnswerArgs, MazeAnswerReply, MazeDropReply, MazeLotteryReply, MazePreData, MazeShopItems, MazeState,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { emptyWireState } from './maze-board';
import type { MazeOutcome } from './maze-outcome';
import { MazeSubpanels } from './maze-subpanels.service';
import { MazeService } from './maze.service';

/** First argument as a plain object ({} when absent). */
function objectArg(args: unknown[]): Record<string, unknown> {
  const a = args[0];
  return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
}

const intOf = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
};

const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';

@Injectable()
export class MazeRpc {
  constructor(private readonly maze: MazeService, private readonly panels: MazeSubpanels) {}

  @Rpc('getMazePreDate', { requireCharacter: true })
  getMazePreDate(session: Session): Promise<MazePreData> {
    return this.maze.preData(session.characterId!);
  }

  @Rpc('refreshMaze', { requireCharacter: true })
  refreshMaze(session: Session): Promise<MazePreData> {
    return this.maze.refresh(session);
  }

  @Rpc('enterMaze', { requireCharacter: true, forbidInBattle: true })
  enterMaze(session: Session): Promise<boolean> {
    return this.maze.enter(session);
  }

  @Rpc('getMazeData', { requireCharacter: true })
  getMazeData(session: Session): Promise<MazeState> {
    return this.maze.stateOf(session.characterId!);
  }

  /** Runs a state action: its pushes first, then the full state as the reply (the empty state when there is no run). */
  private async stateReply(session: Session, out: MazeOutcome | null): Promise<MazeState> {
    if (!out) return this.maze.stateOf(session.characterId!);
    await this.maze.dispatch(session, out, false);
    return out.state ?? emptyWireState();
  }

  @Rpc('mazeConfirm', { requireCharacter: true })
  async mazeConfirm(session: Session): Promise<MazeState> {
    return this.stateReply(session, await this.maze.confirm(session));
  }

  @Rpc('mazeSkip', { requireCharacter: true })
  async mazeSkip(session: Session): Promise<MazeState> {
    return this.stateReply(session, await this.maze.skip(session));
  }

  @Rpc('mazeBuySkipNum', { requireCharacter: true })
  async mazeBuySkipNum(session: Session): Promise<MazeState> {
    return this.stateReply(session, await this.maze.buyCounter(session, 'skip'));
  }

  @Rpc('mazeBuyRecoverNum', { requireCharacter: true })
  async mazeBuyRecoverNum(session: Session): Promise<MazeState> {
    return this.stateReply(session, await this.maze.buyCounter(session, 'recover'));
  }

  @Rpc('mazeLeave', { requireCharacter: true })
  async mazeLeave(session: Session): Promise<true> {
    await this.maze.leave(session);
    return true;
  }

  /** Null responder in Flash: the HP and HUD refresh come back as pushes. */
  @Rpc('mazeRecover', { requireCharacter: true })
  async mazeRecover(session: Session, args: unknown[]): Promise<null> {
    const out = await this.maze.recover(session, truthy(objectArg(args).recover));
    if (out) await this.maze.dispatch(session, out, true);
    return null;
  }

  @Rpc('answerMazeQuestion', { requireCharacter: true })
  async answerMazeQuestion(session: Session, args: unknown[]): Promise<MazeAnswerReply> {
    const a = objectArg(args);
    const parsed: MazeAnswerArgs = {
      answerNum: intOf(a.answerNum, 'answerNum'), rightNum: intOf(a.rightNum, 'rightNum'), ...(typeof a.choice === 'string' ? { choice: a.choice.slice(0, 2) } : {}),
    };
    return this.panels.answer(session, parsed);
  }

  @Rpc('getMazeShopItem', { requireCharacter: true })
  async getMazeShopItem(session: Session): Promise<MazeShopItems | Record<string, never>> {
    return (await this.panels.shopItems(session.characterId!)) ?? {};
  }

  /** Reply: the bought slot index (1 / 2) or 0. */
  @Rpc('buyMazeShopItem', { requireCharacter: true })
  buyMazeShopItem(session: Session, args: unknown[]): Promise<number> {
    const a = objectArg(args);
    return this.panels.buyShop(session, intOf(a.sid, 'sid'), intOf(a.index, 'index'));
  }

  @Rpc('mazeDrop', { requireCharacter: true })
  mazeDrop(session: Session, args: unknown[]): Promise<MazeDropReply | null> {
    return this.panels.drop(session, intOf(objectArg(args).index, 'index'));
  }

  @Rpc('getMazeLottery', { requireCharacter: true })
  getMazeLottery(session: Session): Promise<MazeLotteryReply> {
    return this.panels.takeLottery(session);
  }
}
