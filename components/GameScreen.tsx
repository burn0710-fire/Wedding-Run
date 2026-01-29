import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ObstacleType =
  | "GROUND_SMALL"
  | "GROUND_LARGE"
  | "FLYING_SMALL"
  | "FLYING_LARGE";

type Obstacle = {
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  markedForDeletion: boolean;
};

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// ==== 画面サイズ・見た目 ====
const CANVAS_W = 800;
const CANVAS_H = 450;

const GROUND_HEIGHT = 80;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;

// ==== 物理パラメータ（前のロジックベース・フレーム単位） ====
// ここが「ジャンプの気持ちよさ」を決める
const GRAVITY = 0.8;        // 1フレームごとに +0.8
const JUMP_STRENGTH = -15;  // ジャンプ開始時の速度（上向き）

// ==== 敵スピード関連（px / frame）====
const INITIAL_SPEED = 8;
const MAX_SPEED = 26;
const ACCELERATION = 0.03; // フレームごとに速度がじわじわ増える

// spawn 間隔（frame 単位）
const SPAWN_BASE_MIN = 60;  // だいたいこのあたり〜
const SPAWN_BASE_VAR = 80;  // + ランダム

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const scoreRef = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState(0);

  const gameState = useRef({
    isPlaying: true,
    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,

    player: {
      x: 80,
      y: GROUND_Y, // 「足元」の Y（上向きにジャンプ）
      dy: 0,
      isJumping: false,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    },

    obstacles: [] as Obstacle[],
  });

  // ===== ジャンプ開始（マウス押下 / タップ開始） =====
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = JUMP_STRENGTH;
      state.player.isJumping = true;
    }
  }, []);

  // ===== ジャンプ終了（マウス離し / タップ終了） =====
  // 押しっぱなしで高く、早めに離すと低くなる感じ
  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy = state.player.dy * 0.45;
    }
  }, []);

  // ===== メインループ =====
  const update = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dtMs = time - (lastTimeRef.current || time);
      lastTimeRef.current = time;

      const state = gameState.current;

      // ---- スコアは dt を使って緩やかに加算 ----
      if (state.isPlaying) {
        // Dino Run っぽく「速いほどスコア増加も早い」
        scoreRef.current += 0.1 * (state.speed / INITIAL_SPEED) * (dtMs / 16.67);
        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) setCurrentScore(s);
      }

      // ==== GAME UPDATE ====
      if (state.isPlaying) {
        // スピードアップ
        state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION);

        // プレイヤー物理（フレームベース）
        state.player.dy += GRAVITY;
        state.player.y += state.player.dy;

        // 地面との当たり
        if (state.player.y > GROUND_Y) {
          state.player.y = GROUND_Y;
          state.player.dy = 0;
          if (state.player.isJumping) {
            state.player.isJumping = false;
          }
        }

        // 敵 spawn 管理
        state.frameCount++;

        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          // ランダムでタイプ選択
          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";
          let width = 30;
          let height = 30;
          let yPos = GROUND_Y - height;

          if (r < 0.4) {
            type = "GROUND_SMALL";
            width = 30;
            height = 30;
            yPos = GROUND_Y - height;
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
            width = 45;
            height = 55;
            yPos = GROUND_Y - height;
          } else if (r < 0.9) {
            type = "FLYING_SMALL";
            width = 30;
            height = 25;
            yPos = GROUND_Y - 60;
          } else {
            type = "FLYING_LARGE";
            width = 50;
            height = 40;
            yPos = GROUND_Y - 80;
          }

          state.obstacles.push({
            type,
            x: CANVAS_W + 50,
            y: yPos,
            width,
            height,
            markedForDeletion: false,
          });

          // 次の spawn までのフレーム数
          state.nextSpawnThreshold =
            SPAWN_BASE_MIN + Math.random() * SPAWN_BASE_VAR;
        }

        // 敵の移動・削除
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -100) {
            obs.markedForDeletion = true;
          }
        });
        state.obstacles = state.obstacles.filter((o) => !o.markedForDeletion);

        // ==== 当たり判定 ====
        const playerLeft = state.player.x;
        const playerRight = state.player.x + state.player.width;
        const playerBottom = state.player.y;
        const playerTop = state.player.y - state.player.height;

        const playerPadding = 10;

        for (const obs of state.obstacles) {
          const obsLeft = obs.x + playerPadding;
          const obsRight = obs.x + obs.width - playerPadding;
          const obsTop = obs.y;
          const obsBottom = obs.y + obs.height;

          const hit =
            playerLeft < obsRight &&
            playerRight > obsLeft &&
            playerTop < obsBottom &&
            playerBottom > obsTop;

          if (hit) {
            state.isPlaying = false;
            onGameOver(Math.floor(scoreRef.current));
            break;
          }
        }
      }

      // ==== 描画 ====
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 地面
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, GROUND_Y, CANVAS_W, GROUND_HEIGHT);

      // プレイヤー
      const px = state.player.x;
      const pyTop = state.player.y - state.player.height;
      ctx.fillStyle = "red";
      ctx.fillRect(px, pyTop, state.player.width, state.player.height);

      // 敵
      state.obstacles.forEach((obs) => {
        ctx.fillStyle =
          obs.type === "GROUND_SMALL" || obs.type === "GROUND_LARGE"
            ? "#1d4ed8"
            : "#2563eb";
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      });

      requestRef.current = requestAnimationFrame(update);
    },
    [currentScore, onGameOver]
  );

  // 初期セットアップ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
    }

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div
      className="w-full h-full relative bg-[#003654] select-none"
      onMouseDown={startJump}
      onMouseUp={endJump}
      onTouchStart={startJump}
      onTouchEnd={endJump}
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
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm z-10">
        SCORE: {Math.floor(scoreRef.current).toString().padStart(5, "0")}
      </div>
    </div>
  );
};

export default GameScreen;
