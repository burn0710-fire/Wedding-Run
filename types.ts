
export interface ScoreEntry {
  id?: string;
  name: string;
  score: number;
  timestamp: any; // Firestore Timestamp
  eventId: string;
}

export interface GameConfig {
  initialSpeed: number;
  maxSpeed: number;
  acceleration: number;
  gravity: number;
  jumpStrength: number;
  spawnRateMin: number;
  spawnRateMax: number;
}

export enum AppState {
  LOADING,
  PIN,
  TITLE,
  GAME,
  RESULT,
  RANKING
}

export interface PlayerState {
  x: number;
  y: number;
  dy: number;
  isJumping: boolean;
  width: number;
  height: number;
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  markedForDeletion: boolean;
}
