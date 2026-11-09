// Illustrative interfaces for contract discussion, NOT drop-in production code.
export type Element = 'EMBER' | 'GROVE' | 'TIDE' | 'AETHER';
export type Gem = 'STRIKE' | 'GUARD' | 'FOCUS' | 'VITALITY' | 'SPARK';
export type BattleMode = 'PVE' | 'PVP_UNRANKED' | 'PVP_RANKED';
export type BattleStatus = 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type Cell = readonly [row: number, col: number];
export type BoardCell = { gem: Gem; special?: 'LINE' | 'BURST' };
export type Board = readonly (readonly BoardCell[])[];
export interface Stats { attack: number; defense: number; maxHp: number; }
export interface BattlePet {
  instanceId: string;
  speciesId: string;
  element: Element;
  stats: Stats;
  hp: number;
  barrier: number;
  mana: number;
  charge: number;
  skillCooldowns: Record<string, number>;
  statuses: readonly { type: 'BURN' | 'ROOT' | 'WARD'; remainingTurns: number }[];
}
export interface Party { actorId: string; pets: readonly BattlePet[]; activeIndex: number; }
export interface BattleSnapshot {
  id: string;
  mode: BattleMode;
  rulesetVersion: string;
  contentVersion: string;
  version: number;
  turnNo: number;
  currentActorId: string;
  board: Board;
  parties: readonly Party[];
  status: BattleStatus;
  // Secret PRNG state belongs in server-only persistence, NOT client snapshot.
}
export type TurnCommand = {
  type: 'MAKE_TURN'; commandId: string; expectedVersion: number;
  swap: { from: Cell; to: Cell }; preSwapSkillId?: string;
} | {
  type: 'SWAP_PET'; commandId: string; expectedVersion: number; nextActiveIndex: number;
};
export interface BattleEvent {
  eventId: string; battleId: string; seq: number; stateVersion: number;
  rulesetVersion: string; type: string; payload: Record<string, unknown>;
}
export interface BattleReduction {
  nextState: BattleSnapshot;
  orderedEvents: readonly BattleEvent[];
  stateHash: string;
}
