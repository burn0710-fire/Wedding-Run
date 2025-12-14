
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

export type ObstacleType = 'GROUND_SMALL' | 'GROUND_LARGE' | 'FLYING_SMALL' | 'FLYING_LARGE';

export interface Obstacle {
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  markedForDeletion: boolean;
}
