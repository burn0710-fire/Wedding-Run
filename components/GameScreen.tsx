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
  y: number; // 上端
  width: number;
  height: number;
  markedForDeletion: boolean;
};

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

/* ===== 論理解像度 ===== */
const CANVAS_W = 800;
const CANVAS_H = 450;

/* ===== 地面 ===== */
const GROUND_HEIGHT = 80;
const GROUND_TOP = CANVAS_H - GROUND_HEIGHT;

// 「足が乗るライン」（ground の黄土色の少し上）
const FLOOR_Y = CANVAS_H - 38; // ここは好みで微調整してOK

/* ===== 物理パラメータ（Dino Run っぽく） ===== */
const GRAVITY = 0.8; // px/frame^2
const JUMP_STRENGTH = -15;

const INITIAL_SPEED = 5;   // 以前よりゆっくり目
const MAX_SPEED = 22;
const ACCELERATION = 0.025;

const SPAWN_BASE_MIN = 60;
const SPAWN_BASE_VAR = 80;

type PlayerAnimState = "run" | "jump" | "die";

/* ===== 画像読み込みユーティリティ ===== */
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

  const gameState = useRef({
    isPlaying: true,
    isGameOver: false,
    gameOverWaitMs: 0,
    hasGameOverSent: false,

    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,

    bgFarOffset: 0,
    bgMidOffset: 0,
    groundOffset: 0,

    player: {
      // y は「足元の高さ」
      x: 140,
      y: FLOOR_Y,
      dy: 0,
      isJumping: false,
      // 描画サイズ（画像の縦横比は描画時に計算）
      drawWidth: 80,
      drawHeight: 120,
      // 当たり判定用
      hitWidth: 60,
      hitHeight: 110,

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

  /* ===== 画像読み込み ===== */
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

      // キャラ画像の縦横比を保ったまま、描画サイズを設定
      if (chara1) {
        const SCALE = 0.42; // ここを大きくするとキャラが大きくなる（1.5倍くらいのイメージ）
        const h = chara1.height * SCALE;
        const w = chara1.width * SCALE;

        gameState.current.player.drawHeight = h;
        gameState.current.player.drawWidth = w;

        // 当たり判定は少し細めに
        gameState.current.player.hitHeight = h * 0.9;
        gameState.current.player.hitWidth = w * 0.6;
      }
    };

    loadAll();
  }, []);

  /* ===== ジャンプ ===== */
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = JUMP_STRENGTH;
      state.player.isJumping = true;
      state.player.animState = "jump";
    }
  }, []);

  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy *= 0.45;
    }
  }, []);

  /* ===== メインループ ===== */
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

      // スコア更新（プレイ中のみ）
      if (state.isPlaying) {
        scoreRef.current +=
          0.1 * (state.speed / INITIAL_SPEED) * (dtMs / 16.67);
        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) setCurrentScore(s);
      }

      // ===== 更新処理 =====
      if (state.isPlaying) {
        // スピードアップ
        state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION);

        // 背景スクロール（右→左）
        state.bgFarOffset += state.speed * 0.3;
        state.bgMidOffset += state.speed * 0.6;
        state.groundOffset += state.speed * 1.0;

        // プレイヤー物理（y は足元）
        state.player.dy += GRAVITY;
        state.player.y += state.player.dy;

        if (state.player.y > FLOOR_Y) {
          state.player.y = FLOOR_Y;
          state.player.dy = 0;
          if (state.player.isJumping) {
            state.player.isJumping = false;
            state.player.animState = "run";
          }
        }

        // 走りアニメーション
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

        // 障害物生成
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";

          if (r < 0.4) type = "GROUND_SMALL";
          else if (r < 0.7) type = "GROUND_LARGE";
          else if (r < 0.9) type = "FLYING_SMALL";
          else type = "FLYING_LARGE";

          // 縦横比を守ったサイズで生成
          const groundScale = 0.6;
          const flyScale = 0.6;

          const makeSize = (
            cfg: { width: number; height: number },
            scale: number
          ) => ({
            width: cfg.width * scale,
            height: cfg.height * scale,
          });

          let size: { width: number; height: number };
          let baseY = FLOOR_Y;

          if (type === "GROUND_SMALL") {
            size = makeSize(assetConfig.OBSTACLES.GROUND_SMALL, groundScale);
          } else if (type === "GROUND_LARGE") {
            size = makeSize(assetConfig.OBSTACLES.GROUND_LARGE, groundScale);
          } else if (type === "FLYING_SMALL") {
            size = makeSize(assetConfig.OBSTACLES.FLYING_SMALL, flyScale);
            baseY = FLOOR_Y - 90; // 小さい鳥は少し上
          } else {
            size = makeSize(assetConfig.OBSTACLES.FLYING_LARGE, flyScale);
            // 大きい鳥：ギリギリ飛び越えられる高さ
            baseY = FLOOR_Y - 70;
          }

          const yTop = baseY - size.height;

          state.obstacles.push({
            type,
            x: CANVAS_W + 60,
            y: yTop,
            width: size.width,
            height: size.height,
            markedForDeletion: false,
          });

          state.nextSpawnThreshold =
            SPAWN_BASE_MIN + Math.random() * SPAWN_BASE_VAR;
        }

        // 障害物移動
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -120) {
            obs.markedForDeletion = true;
          }
        });
        state.obstacles = state.obstacles.filter((o) => !o.markedForDeletion);

        // 当たり判定（キャラは少し細めの矩形で）
        const p = state.player;
        const pLeft = p.x;
        const pRight = p.x + p.hitWidth;
        const pBottom = p.y;
        const pTop = p.y - p.hitHeight;

        for (const obs of state.obstacles) {
          const oLeft = obs.x + 10;
          const oRight = obs.x + obs.width - 10;
          const oTop = obs.y;
          const oBottom = obs.y + obs.height;

          const hit =
            pLeft < oRight &&
            pRight > oLeft &&
            pTop < oBottom &&
            pBottom > oTop;

          if (hit) {
            state.isPlaying = false;
            state.isGameOver = true;
            state.gameOverWaitMs = 0;
            state.player.animState = "die";
            break;
          }
        }
      }

      // 死亡後 1 秒だけ止めてから onGameOver
      if (state.isGameOver && !state.hasGameOverSent) {
        state.gameOverWaitMs += dtMs;
        if (state.gameOverWaitMs >= 1000) {
          state.hasGameOverSent = true;
          onGameOver(Math.floor(scoreRef.current));
        }
      }

      /* ===== 描画 ===== */
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景ベース色
      ctx.fillStyle = "#cfeeff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景 FAR
      if (assets.bgFar) {
        const img = assets.bgFar;
        const drawH = CANVAS_H - GROUND_HEIGHT;
        const drawW = CANVAS_W;
        const offset = ((state.bgFarOffset % drawW) + drawW) % drawW;
        let x = -offset;
        while (x < CANVAS_W) {
          ctx.drawImage(img, 0, 0, img.width, img.height, x, 0, drawW, drawH);
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
          ctx.drawImage(img, 0, 0, img.width, img.height, x, 0, drawW, drawH);
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
            GROUND_TOP,
            tileW,
            GROUND_HEIGHT
          );
          x += tileW;
        }
      }

      // プレイヤー描画（縦横比を維持）
      const p = state.player;
      const playerImg =
        p.animState === "die"
          ? assets.charaDie
          : p.animState === "jump"
          ? assets.charaRun1
          : p.runFrame === 0
          ? assets.charaRun1
          : assets.charaRun2;

      const pTop = p.y - p.drawHeight;

      if (playerImg) {
        ctx.drawImage(
          playerImg,
          0,
          0,
          playerImg.width,
          playerImg.height,
          p.x,
          pTop,
          p.drawWidth,
          p.drawHeight
        );
      } else {
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, pTop, p.drawWidth, p.drawHeight);
      }

      // 障害物描画（縦横比維持）
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

  /* ===== 初期セットアップ ===== */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
    }

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div
      className="w-full h-full relative bg-[#003654] overflow-hidden select-none"
      onMouseDown={startJump}
      onMouseUp={endJump}
      onTouchStart={startJump}
      onTouchEnd={endJump}
    >
      {/* 画面下寄せ（スマホで ground が見えるように） / PC では中央寄せ */}
      <div className="absolute inset-0 flex justify-center items-end lg:items-center pb-4 lg:pb-0">
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
