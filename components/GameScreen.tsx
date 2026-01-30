// src/components/GameScreen.tsx
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import assetConfig from "../config/assets";

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

// === キャンバス論理サイズ ===
const CANVAS_W = 800;
const CANVAS_H = 450;

// ground の高さ（描画時）
const GROUND_HEIGHT = 80;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

// ground の中で「足が乗るライン」のオフセット
// 黄緑の地面 → 黄土色の土 の境目あたりを狙って少し下げる
const FLOOR_OFFSET = 40;
const FLOOR_Y = GROUND_Y + FLOOR_OFFSET; // キャラ・地上オブジェクトの足元 Y

// === プレイヤー ===
// 以前より約 1.5 倍くらい大きく
const PLAYER_WIDTH = 110;
const PLAYER_HEIGHT = 165;

// Dino Run ぽい物理
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;

// スピード関連
const INITIAL_SPEED = 5;   // 少しゆっくり目に
const MAX_SPEED = 26;
const ACCELERATION = 0.03;

// 敵の出現間隔（frame 単位）
const SPAWN_BASE_MIN = 60;
const SPAWN_BASE_VAR = 80;

type PlayerAnimState = "run" | "jump" | "die";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("Failed to load image:", src);
      resolve(null);
    };
  });
}

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const scoreRef = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState(0);

  // GameOver 演出用
  const hitTimeRef = useRef<number | null>(null);
  const gameOverSentRef = useRef(false);
  const HIT_HOLD_MS = 1000; // 当たり後 1 秒静止

  const gameState = useRef({
    isPlaying: true,

    // スクロール用
    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,
    bgFarOffset: 0,
    bgMidOffset: 0,
    groundOffset: 0,

    player: {
      x: 120,
      y: FLOOR_Y,
      dy: 0,
      isJumping: false,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      animState: "run" as PlayerAnimState,
      runFrame: 0 as 0 | 1,
      runAnimTimer: 0, // ms
    },

    obstacles: [] as Obstacle[],
  });

  const assetsRef = useRef({
    bgFar: null as HTMLImageElement | null,
    bgMid: null as HTMLImageElement | null,
    ground: null as HTMLImageElement | null,
    obsGroundSmall: null as HTMLImageElement | null,
    obsGroundLarge: null as HTMLImageElement | null,
    obsFlySmall: null as HTMLImageElement | null,
    obsFlyLarge: null as HTMLImageElement | null,
    charaRun1: null as HTMLImageElement | null,
    charaRun2: null as HTMLImageElement | null,
    charaDie: null as HTMLImageElement | null,
    loaded: false,
  });

  // === 画像読み込み ===
  useEffect(() => {
    const loadAll = async () => {
      const [
        bgFar,
        bgMid,
        ground,
        obsGS,
        obsGL,
        obsFS,
        obsFL,
        chara1,
        chara2,
        chara3,
      ] = await Promise.all([
        loadImage(assetConfig.BACKGROUND.FAR.path),
        loadImage(assetConfig.BACKGROUND.MID.path),
        loadImage(assetConfig.GROUND.path),
        loadImage(assetConfig.OBSTACLES.GROUND_SMALL.path),
        loadImage(assetConfig.OBSTACLES.GROUND_LARGE.path),
        loadImage(assetConfig.OBSTACLES.FLYING_SMALL.path),
        loadImage(assetConfig.OBSTACLES.FLYING_LARGE.path),
        loadImage(assetConfig.PLAYER.SPRITES.RUN_1.path),
        loadImage(assetConfig.PLAYER.SPRITES.RUN_2.path),
        loadImage(assetConfig.PLAYER.SPRITES.DIE.path),
      ]);

      assetsRef.current = {
        bgFar,
        bgMid,
        ground,
        obsGroundSmall: obsGS,
        obsGroundLarge: obsGL,
        obsFlySmall: obsFS,
        obsFlyLarge: obsFL,
        charaRun1: chara1,
        charaRun2: chara2,
        charaDie: chara3,
        loaded: true,
      };
    };

    loadAll();
  }, []);

  // === ジャンプ開始 ===
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = JUMP_STRENGTH;
      state.player.isJumping = true;
      state.player.animState = "jump";
    }
  }, []);

  // === ジャンプボタン離し ===
  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy = state.player.dy * 0.45;
    }
  }, []);

  // === メインループ ===
  const update = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dtMs = time - (lastTimeRef.current || time);
      lastTimeRef.current = time;

      const state = gameState.current;
      const assets = assetsRef.current;

      // GameOver 待機中なら、1 秒経ったタイミングで onGameOver を呼ぶ
      if (!state.isPlaying && hitTimeRef.current !== null && !gameOverSentRef.current) {
        const elapsed = time - hitTimeRef.current;
        if (elapsed >= HIT_HOLD_MS) {
          gameOverSentRef.current = true;
          onGameOver(Math.floor(scoreRef.current));
        }
      }

      // スコア更新（動いている間のみ）
      if (state.isPlaying) {
        scoreRef.current +=
          0.1 * (state.speed / INITIAL_SPEED) * (dtMs / 16.67);
        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) setCurrentScore(s);
      }

      // ===== 更新 =====
      if (state.isPlaying) {
        // スピードアップ
        state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION);

        // 背景スクロール（右→左）
        state.bgFarOffset += state.speed * 0.3;
        state.bgMidOffset += state.speed * 0.6;
        state.groundOffset += state.speed;

        // プレイヤー物理
        state.player.dy += GRAVITY;
        state.player.y += state.player.dy;

        // 地面との衝突（足元が FLOOR_Y より下に行かないように）
        if (state.player.y > FLOOR_Y) {
          state.player.y = FLOOR_Y;
          state.player.dy = 0;

          if (state.player.isJumping) {
            state.player.isJumping = false;
            state.player.animState = "run";
          }
        }

        // 走りアニメーション（run のときだけ）
        if (state.player.animState === "run") {
          state.player.runAnimTimer += dtMs;
          if (state.player.runAnimTimer > 120) {
            state.player.runAnimTimer = 0;
            state.player.runFrame = state.player.runFrame === 0 ? 1 : 0;
          }
        } else {
          state.player.runAnimTimer = 0;
          state.player.runFrame = 0;
        }

        // 敵の出現管理
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";
          let width = 70;
          let height = 90;
          let yPos = FLOOR_Y - height;

          if (r < 0.4) {
            type = "GROUND_SMALL";
            width = 70;
            height = 90;
            yPos = FLOOR_Y - height;
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
            width = 90;
            height = 130;
            yPos = FLOOR_Y - height;
          } else if (r < 0.9) {
            type = "FLYING_SMALL";
            width = 90;
            height = 70;
            // 下をくぐれるくらいの高さ（足元より少し上）
            yPos = FLOOR_Y - height - 70;
          } else {
            type = "FLYING_LARGE";
            width = 120;
            height = 90;
            // こちらもギリギリ飛び越える or くぐるくらい
            yPos = FLOOR_Y - height - 60;
          }

          state.obstacles.push({
            type,
            x: CANVAS_W + 50,
            y: yPos,
            width,
            height,
            markedForDeletion: false,
          });

          state.nextSpawnThreshold =
            SPAWN_BASE_MIN + Math.random() * SPAWN_BASE_VAR;
        }

        // 敵の移動
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -100) {
            obs.markedForDeletion = true;
          }
        });
        state.obstacles = state.obstacles.filter((o) => !o.markedForDeletion);

        // 当たり判定
        const pLeft = state.player.x;
        const pRight = state.player.x + state.player.width;
        const pBottom = state.player.y;
        const pTop = state.player.y - state.player.height;

        const pad = 10;

        for (const obs of state.obstacles) {
          const oLeft = obs.x + pad;
          const oRight = obs.x + obs.width - pad;
          const oTop = obs.y;
          const oBottom = obs.y + obs.height;

          const hit =
            pLeft < oRight &&
            pRight > oLeft &&
            pTop < oBottom &&
            pBottom > oTop;

          if (hit) {
            state.isPlaying = false;
            state.player.animState = "die";
            hitTimeRef.current = time;
            break;
          }
        }
      }

      // ===== 描画 =====
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 空色のベース
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景 FAR
      if (assets.bgFar) {
        const img = assets.bgFar;
        const drawH = CANVAS_H - GROUND_HEIGHT;
        const drawW = CANVAS_W;
        const offset = ((state.bgFarOffset % drawW) + drawW) % drawW;
        let x = -offset;
        while (x < CANVAS_W) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            x,
            0,
            drawW,
            drawH
          );
          x += drawW;
        }
      }

      // 背景 MID
      if (assets.bgMid) {
        const img = assets.bgMid;
        const drawH = CANVAS_H - GROUND_HEIGHT;
        const drawW = CANVAS_W;
        const offset = ((state.bgMidOffset % drawW) + drawW) % drawW;
        let x = -offset;
        while (x < CANVAS_W) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            x,
            0,
            drawW,
            drawH
          );
          x += drawW;
        }
      }

      // 地面
      if (assets.ground) {
        const img = assets.ground;
        const scale = GROUND_HEIGHT / img.height;
        const tileW = img.width * scale;
        const offset = ((state.groundOffset % tileW) + tileW) % tileW;
        let x = -offset;
        while (x < CANVAS_W) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            x,
            GROUND_Y,
            tileW,
            GROUND_HEIGHT
          );
          x += tileW;
        }
      } else {
        ctx.fillStyle = "#4caf50";
        ctx.fillRect(0, GROUND_Y, CANVAS_W, GROUND_HEIGHT);
      }

      // プレイヤー
      const p = state.player;
      const pyTop = p.y - p.height;
      let playerImg: HTMLImageElement | null = null;

      if (p.animState === "die") {
        playerImg = assets.charaDie;
      } else if (p.animState === "jump") {
        playerImg = assets.charaRun1; // ジャンプ中は 1 枚目固定
      } else {
        playerImg = p.runFrame === 0 ? assets.charaRun1 : assets.charaRun2;
      }

      if (playerImg) {
        ctx.drawImage(
          playerImg,
          0,
          0,
          playerImg.width,
          playerImg.height,
          p.x,
          pyTop,
          p.width,
          p.height
        );
      } else {
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, pyTop, p.width, p.height);
      }

      // 敵
      state.obstacles.forEach((obs) => {
        let img: HTMLImageElement | null = null;
        if (obs.type === "GROUND_SMALL") img = assets.obsGroundSmall;
        else if (obs.type === "GROUND_LARGE") img = assets.obsGroundLarge;
        else if (obs.type === "FLYING_SMALL") img = assets.obsFlySmall;
        else img = assets.obsFlyLarge;

        if (img) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            obs.x,
            obs.y,
            obs.width,
            obs.height
          );
        } else {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        }
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
      {/* 中央に固定サイズのゲーム画面を表示（スマホ横でも ground が見えるよう上下中央寄せ） */}
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
