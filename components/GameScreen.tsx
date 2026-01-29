import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

enum PlayerState {
  RUNNING = "RUNNING",
  JUMPING = "JUMPING",
  CRASHED = "CRASHED",
}

type Enemy = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
};

const CANVAS_W = 800;
const CANVAS_H = 450;

const GROUND_HEIGHT = 80;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 60;

// ==== 物理パラメータ ====
// もとのジャンプよりかなり低く（約 1/20）
const GRAVITY = 1800;
const JUMP_STRENGTH = -180; // ここを上げ下げで微調整

const MAX_JUMPS = 1;

// ==== 敵のスピード & 出現タイミング ====
// 基本スピード
const ENEMY_SPEED_START = 220;
const ENEMY_SPEED_MAX = 700;
// 時間経過でだんだん速くなる
const ENEMY_SPEED_GROWTH = 40; // 毎秒 +40 くらい

// 出現間隔（秒）
const SPAWN_INTERVAL_START = 1.6; // 最初はゆっくり
const SPAWN_INTERVAL_MIN = 0.6;   // ここまで短くなる
const SPAWN_INTERVAL_DECAY = 0.08; // 毎秒 0.08 ずつ短く

const GameScreen: React.FC<{ onGameOver: (score: number) => void }> = ({
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  const [currentScore, setCurrentScore] = useState(0);
  const scoreRef = useRef<number>(0);

  const playerRef = useRef({
    y: CANVAS_H - GROUND_HEIGHT - PLAYER_HEIGHT,
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const isGameOverRef = useRef(false);

  // 敵スピード & 出現間隔の変化用
  const enemySpeedRef = useRef(ENEMY_SPEED_START);
  const spawnIntervalRef = useRef(SPAWN_INTERVAL_START);
  const spawnTimerRef = useRef(0);

  const enemyGroundY = CANVAS_H - GROUND_HEIGHT - ENEMY_HEIGHT;

  // 初期化
  useEffect(() => {
    console.log("Dino-like GameScreen mounted");

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
    }

    enemiesRef.current = [];
    enemySpeedRef.current = ENEMY_SPEED_START;
    spawnIntervalRef.current = SPAWN_INTERVAL_START;
    spawnTimerRef.current = 0.5; // 最初の敵は0.5秒後くらい

    scoreRef.current = 0;
    setCurrentScore(0);
    isGameOverRef.current = false;

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const update = useCallback(
    (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      const playerX = 80;

      // スコア
      if (!isGameOverRef.current) {
        scoreRef.current += dt * 10;
        setCurrentScore(Math.floor(scoreRef.current));
      }

      // ===== プレイヤー物理 =====
      const p = playerRef.current;
      p.vy += GRAVITY * dt;
      p.y += p.vy;

      const groundY = CANVAS_H - GROUND_HEIGHT - PLAYER_HEIGHT;
      if (p.y > groundY) {
        p.y = groundY;
        p.vy = 0;
        p.jumpCount = 0;
      }

      // ===== 敵スピード & 出現間隔を時間で変化 =====
      enemySpeedRef.current = Math.min(
        ENEMY_SPEED_MAX,
        enemySpeedRef.current + ENEMY_SPEED_GROWTH * dt
      );
      spawnIntervalRef.current = Math.max(
        SPAWN_INTERVAL_MIN,
        spawnIntervalRef.current - SPAWN_INTERVAL_DECAY * dt
      );

      // ===== 敵出現（ランダム間隔） =====
      spawnTimerRef.current -= dt;
      if (!isGameOverRef.current && spawnTimerRef.current <= 0) {
        enemiesRef.current.push({
          x: CANVAS_W + 40,
          y: enemyGroundY,
          width: ENEMY_WIDTH,
          height: ENEMY_HEIGHT,
          speed: enemySpeedRef.current,
        });

        // 間隔 ±30% くらいのランダム
        const base = spawnIntervalRef.current;
        spawnTimerRef.current = base * (0.7 + Math.random() * 0.6);
      }

      // ===== 敵の移動 =====
      enemiesRef.current.forEach((e) => {
        // 既存の敵も少しずつ加速させる
        e.speed = Math.min(
          ENEMY_SPEED_MAX,
          e.speed + ENEMY_SPEED_GROWTH * dt
        );
        e.x -= e.speed * dt;
      });

      // 画面外の敵は削除
      enemiesRef.current = enemiesRef.current.filter(
        (e) => e.x + e.width > 0
      );

      // ===== 当たり判定 =====
      if (!isGameOverRef.current) {
        const playerHitBox = {
          x: playerX,
          y: p.y,
          w: PLAYER_WIDTH,
          h: PLAYER_HEIGHT,
        };

        for (const e of enemiesRef.current) {
          const hit =
            playerHitBox.x < e.x + e.width &&
            playerHitBox.x + playerHitBox.w > e.x &&
            playerHitBox.y < e.y + e.height &&
            playerHitBox.y + playerHitBox.h > e.y;

          if (hit) {
            console.log("HIT!");
            isGameOverRef.current = true;
            cancelAnimationFrame(requestRef.current);
            onGameOver(Math.floor(scoreRef.current));
            return;
          }
        }
      }

      // ===== 描画 =====
      // 背景
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 地面
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(
        0,
        CANVAS_H - GROUND_HEIGHT,
        CANVAS_W,
        GROUND_HEIGHT
      );

      // プレイヤー
      ctx.fillStyle = "red";
      ctx.fillRect(playerX, p.y, PLAYER_WIDTH, PLAYER_HEIGHT);

      // 敵
      ctx.fillStyle = "blue";
      enemiesRef.current.forEach((e) => {
        ctx.fillRect(e.x, e.y, e.width, e.height);
      });

      requestRef.current = requestAnimationFrame(update);
    },
    [onGameOver]
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  const handleMouseDown = () => {
    if (isGameOverRef.current) return;

    // 一段ジャンプのみ
    if (playerRef.current.jumpCount < MAX_JUMPS) {
      playerRef.current.vy = JUMP_STRENGTH;
      playerRef.current.jumpCount++;
    }
  };

  return (
    <div
      className="w-full h-full relative bg-[#003654]"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            border: "4px solid #ffd800",
            boxSizing: "content-box",
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-white/80 px-3 py-1 rounded-lg font-bold text-orange-600">
        SCORE: {currentScore.toString().padStart(5, "0")}
      </div>
    </div>
  );
};

export default GameScreen;
