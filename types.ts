
export type Position = 1 | 2 | 3 | 4 | 5 | 6;

// Maps position number (1-6) to jersey number (string)
export type Lineup = Record<Position, string>;

export type PlayerRole = 'OH' | 'MB' | 'OP' | 'S' | 'L' | 'DS' | '?';

// Maps position to role
export type RoleMapping = Record<Position, PlayerRole>;

export interface Coordinate {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

export enum ActionType {
  SERVE = 'SERVE',
  ATTACK = 'ATTACK',
  BLOCK = 'BLOCK',
  DIG = 'DIG',
  SET = 'SET',
  RECEIVE = 'RECEIVE',
  SUB = 'SUB'
}

export enum ActionQuality {
  PERFECT = 'PERFECT', // #
  GOOD = 'GOOD',       // +
  NORMAL = 'NORMAL',   // !
  POOR = 'POOR'        // -
}

export enum ResultType {
  POINT = 'POINT',   // We score
  ERROR = 'ERROR',   // Opponent scores
  NORMAL = 'NORMAL'  // Play continues
}

export interface LogEntry {
  id: string;
  timestamp: number;
  setNumber: number; // Added: Track which set this log belongs to
  myScore: number;
  opScore: number;
  playerNumber: string;
  position: Position | 'L'; // Updated to include Libero
  action: ActionType;
  quality: ActionQuality; 
  result: ResultType;
  startCoord?: Coordinate; // Optional: where the player was
  endCoord?: Coordinate;   // Where the ball landed
  note?: string;
  servingTeam: 'me' | 'op';
}

export interface TeamConfig {
  matchName: string;
  myName: string;
  opName: string;
}

export type TeamSide = 'me' | 'op';

// State used for History (Undo/Redo) and Saving
export interface GameState {
  currentSet: number; // Added: Current set number
  mySetWins: number;  // Added: Sets won by me
  opSetWins: number;  // Added: Sets won by opponent
  myLineup: Lineup;
  opLineup: Lineup;
  myRoles: RoleMapping; // Added: Roles
  opRoles: RoleMapping; // Added: Roles
  myLibero: string; // Added Libero
  opLibero: string; // Added Libero
  myScore: number;
  opScore: number;
  servingTeam: TeamSide;
  logs: LogEntry[];
}

// Complete save object structure
export interface SavedGame {
  config: TeamConfig;
  state: GameState;
  savedAt: number;
}
