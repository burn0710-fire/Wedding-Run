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

// ===== Dino Run っぽいシンプル物理パラメータ =====
const GROUND_HEIGHT = 80;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 60;

// 重力とジャンプ。2段ジャンプをやめるので
// 以前と同じくらいで、画面外に飛び出さないはず
const GRAVITY = 1800;
const JUMP_STRENGTH = -700;

// ★ 一段ジャンプだけにする
const MAX_JUMPS = 1;

// 敵は常に一定スピード
const ENEMY_SPEED = 260;

// 敵の出現間隔（ピクセル）
const ENEMY_SPACING = 280;

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

  // 右端に一番近い敵の x を返す
  const getRightmostEnemyX = () => {
    if (enemiesRef.current.length === 0) return CANVAS_W;
    return Math.max(...enemiesRef.current.map((e) => e.x));
  };

  // 初期化
  useEffect(() => {
    console.log("Minimal Dino-like GameScreen mounted (no config)");

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
    }

    const enemyGroundY = CANVAS_H - GROUND_HEIGHT - ENEMY_HEIGHT;

    // ★ 等間隔で3体並べておく
    enemiesRef.current = [
      {
        x: CANVAS_W + 200,
        y: enemyGroundY,
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        speed: ENEMY_SPEED,
      },
      {
        x: CANVAS_W + 200 + ENEMY_SPACING,
        y: enemyGroundY,
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        speed: ENEMY_SPEED,
      },
      {
        x: CANVAS_W + 200 + ENEMY_SPACING * 2,
        y: enemyGroundY,
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        speed: ENEMY_SPEED,
      },
    ];

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

      // スコア更新
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
        p.jumpCount = 0; // 地面に着地したらジャンプ回数リセット
      }

      // ===== 敵移動 =====
      enemiesRef.current.forEach((e) => {
        e.x -= e.speed * dt;
      });

      // 画面外に出た敵を、右端 + ENEMY_SPACING の位置に再配置
      const rightmostX = getRightmostEnemyX();
      enemiesRef.current.forEach((e) => {
        if (e.x + e.width < 0) {
          e.x = rightmostX + ENEMY_SPACING;
        }
      });

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
            console.log("HIT (dino-like)!");
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

    // ★ 単純に「地面からの一段ジャンプ」だけ
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
