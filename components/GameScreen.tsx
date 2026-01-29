import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

import gameConfigData from "../config/game";
import assets from "../config/assets";

const config = gameConfigData;

// Dino Run 風の障害物タイプ
type ObstacleType =
  | "GROUND_SMALL"
  | "GROUND_LARGE"
  | "FLYING_SMALL"
  | "FLYING_LARGE";

interface Obstacle {
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  markedForDeletion: boolean;
}

// プレイヤー状態（Spine をやめて 3 枚画像アニメ）
type PlayerAnimState = "RUN" | "JUMP" | "DIE";

interface PlayerState {
  x: number;
  y: number;     // 足元の Y（地面の高さ）
  dy: number;    // 縦方向速度
  isJumping: boolean;
  width: number;
  height: number;
  state: PlayerAnimState;
  animTimer: number;
  animFrameIndex: number; // 0 or 1 を RUN_1 / RUN_2 で切替
}

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// 画像ロード共通関数
const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
      resolve(null);
    };
  });
};

// Canvas を親サイズ & DPI に合わせる
const setupCanvas = (canvas: HTMLCanvasElement) => {
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
};

// 画面内での「論理的な高さ」
const LOGICAL_HEIGHT = 300;
const GROUND_HEIGHT = 20;
const PLAYER_SCALE = 0.25; // chara_1/2/3 の縮尺

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState(0);

  // 画像類まとめ
  const assetsRef = useRef({
    bgFar: null as HTMLImageElement | null,
    bgMid: null as HTMLImageElement | null,
    ground: null as HTMLImageElement | null,
    obsGroundSmall: null as HTMLImageElement | null,
    obsGroundLarge: null as HTMLImageElement | null,
    obsFlySmall: null as HTMLImageElement | null,
    obsFlyLarge: null as HTMLImageElement | null,
    charRun1: null as HTMLImageElement | null,
    charRun2: null as HTMLImageElement | null,
    charJump: null as HTMLImageElement | null,
    charDie: null as HTMLImageElement | null,
    loaded: false,
  });

  // ゲーム状態
  const gameState = useRef({
    isPlaying: true,
    speed: config.initialSpeed,
    frameCount: 0,
    bgFarOffset: 0,
    bgMidOffset: 0,
    nextSpawnThreshold: 60,
    player: {
      x: 50,
      y: 0,
      dy: 0,
      isJumping: false,
      width: 40,
      height: 50,
      state: "RUN" as PlayerAnimState,
      animTimer: 0,
      animFrameIndex: 0,
    } as PlayerState,
    obstacles: [] as Obstacle[],
  });

  // 最初の一回で画像ロード
  useEffect(() => {
    const loadAssets = async () => {
      const [
        bgFar,
        bgMid,
        ground,
        obsGS,
        obsGL,
        obsFS,
        obsFL,
        run1,
        run2,
        jump,
        die,
      ] = await Promise.all([
        loadImage(assets.BACKGROUND.FAR.path),
        loadImage(assets.BACKGROUND.MID.path),
        loadImage(assets.BACKGROUND.GROUND.path),
        loadImage(assets.OBSTACLES.GROUND_SMALL.path),
        loadImage(assets.OBSTACLES.GROUND_LARGE.path),
        loadImage(assets.OBSTACLES.FLYING_SMALL.path),
        loadImage(assets.OBSTACLES.FLYING_LARGE.path),
        loadImage(assets.PLAYER.SPRITES.RUN_1),
        loadImage(assets.PLAYER.SPRITES.RUN_2),
        loadImage(assets.PLAYER.SPRITES.JUMP),
        loadImage(assets.PLAYER.SPRITES.DIE),
      ]);

      assetsRef.current = {
        bgFar,
        bgMid,
        ground,
        obsGroundSmall: obsGS,
        obsGroundLarge: obsGL,
        obsFlySmall: obsFS,
        obsFlyLarge: obsFL,
        charRun1: run1,
        charRun2: run2,
        charJump: jump,
        charDie: die,
        loaded: true,
      };

      // Canvas セットアップ
      const canvas = canvasRef.current;
      if (canvas) {
        setupCanvas(canvas);
        const parent = canvas.parentElement;
        if (parent) {
          const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT;
          gameState.current.player.y = groundY;
        }
      }

      // プレイヤーの当たり判定サイズを画像から計算
      if (run1) {
        gameState.current.player.width = run1.width * PLAYER_SCALE;
        gameState.current.player.height = run1.height * PLAYER_SCALE;
      }
    };

    loadAssets();
  }, []);

  // ジャンプ開始
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;
    if (!state.player.isJumping) {
      state.player.dy = config.jumpStrength; // AI Studio 時代と同じ値前提
      state.player.isJumping = true;
      state.player.state = "JUMP";
    }
  }, []);

  // ジャンプ中に指を離したときの「ショートジャンプ補正」
  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy = state.player.dy * 0.45;
    }
  }, []);

  // メインループ
  const update = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      const dt = (time - (lastTimeRef.current || time)) / 1000;
      lastTimeRef.current = time;

      const state = gameState.current;
      const assetState = assetsRef.current;
      const parent = canvas.parentElement;
      if (!parent) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      const rect = parent.getBoundingClientRect();
      const scale = rect.height / LOGICAL_HEIGHT;
      const logicalWidth = rect.width / scale;
      const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT;

      // === 進行中のときだけ更新 ===
      if (state.isPlaying) {
        // スピード徐々にアップ
        state.speed = Math.min(
          config.maxSpeed,
          state.speed + config.acceleration
        );

        // スコア
        scoreRef.current += 0.1 * (state.speed / config.initialSpeed);
        const scoreInt = Math.floor(scoreRef.current);
        if (scoreInt > currentScore) {
          setCurrentScore(scoreInt);
        }

        // 背景スクロール
        state.bgFarOffset -= state.speed * 0.1;
        state.bgMidOffset -= state.speed * 0.25;
        if (state.bgFarOffset <= -1000) state.bgFarOffset += 1000;
        if (state.bgMidOffset <= -1000) state.bgMidOffset += 1000;

        // プレイヤー物理
        state.player.dy += config.gravity;
        state.player.y += state.player.dy;

        if (state.player.y > groundY) {
          state.player.y = groundY;
          state.player.dy = 0;
          if (state.player.isJumping) {
            state.player.isJumping = false;
            state.player.state = "RUN";
          }
        }

        // RUN アニメのフレーム切り替え
        if (!state.player.isJumping && state.player.state === "RUN") {
          state.player.animTimer += dt;
          if (state.player.animTimer > 0.12) {
            state.player.animTimer = 0;
            state.player.animFrameIndex =
              state.player.animFrameIndex === 0 ? 1 : 0;
          }
        }

        // 障害物生成タイミング
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;
          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";
          let width = 30;
          let height = 30;
          let yPos = groundY - height;

          if (r < 0.4) {
            type = "GROUND_SMALL";
            width = 30;
            height = 30;
            yPos = groundY - height;
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
            width = 40;
            height = 50;
            yPos = groundY - height;
          } else if (r < 0.9) {
            type = "FLYING_SMALL";
            width = 30;
            height = 25;
            yPos = groundY - 60;
          } else {
            type = "FLYING_LARGE";
            width = 50;
            height = 40;
            yPos = groundY - 80;
          }

          state.obstacles.push({
            type,
            x: logicalWidth + 50,
            y: yPos,
            width,
            height,
            markedForDeletion: false,
          });

          state.nextSpawnThreshold = 60 + Math.random() * 80;
        }

        // 障害物移動 & 当たり判定
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -100) obs.markedForDeletion = true;

          const px = state.player.x;
          const pw = state.player.width;
          const ph = state.player.height;
          const pyBottom = state.player.y;
          const pyTop = pyBottom - ph;

          const overlap =
            px < obs.x + obs.width &&
            px + pw > obs.x &&
            pyTop < obs.y + obs.height &&
            pyBottom > obs.y;

          if (overlap && state.isPlaying) {
            state.isPlaying = false;
            state.player.state = "DIE";
            onGameOver(Math.floor(scoreRef.current));
          }
        });

        state.obstacles = state.obstacles.filter((o) => !o.markedForDeletion);
      }

      // === 描画 ===
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.scale(scale, scale);

      // 背景色（空）
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(0, 0, logicalWidth, LOGICAL_HEIGHT);

      // bg_far / bg_mid
      if (assetState.bgFar) {
        const bgW = 1000;
        for (let i = -1; i < 3; i++) {
          ctx.drawImage(
            assetState.bgFar,
            state.bgFarOffset + i * bgW,
            0,
            bgW,
            LOGICAL_HEIGHT
          );
        }
      }
      if (assetState.bgMid) {
        const bgW = 1000;
        for (let i = -1; i < 3; i++) {
          ctx.drawImage(
            assetState.bgMid,
            state.bgMidOffset + i * bgW,
            0,
            bgW,
            LOGICAL_HEIGHT
          );
        }
      }

      // ground
      if (assetState.ground) {
        const tileW = 100;
        const offsetX = -(state.frameCount * state.speed) % tileW;
        for (let i = -1; i < Math.ceil(logicalWidth / tileW) + 1; i++) {
          ctx.drawImage(
            assetState.ground,
            offsetX + i * tileW,
            groundY,
            tileW,
            GROUND_HEIGHT
          );
        }
      } else {
        ctx.fillStyle = "#15803d";
        ctx.fillRect(0, groundY, logicalWidth, GROUND_HEIGHT);
      }

      // プレイヤー描画（3枚スプライト）
      const p = state.player;
      let playerImg: HTMLImageElement | null = null;

      if (p.state === "DIE") {
        playerImg = assetState.charDie;
      } else if (p.state === "JUMP") {
        playerImg = assetState.charJump;
      } else {
        // RUN
        playerImg =
          p.animFrameIndex === 0
            ? assetState.charRun1
            : assetState.charRun2;
      }

      if (playerImg) {
        const drawW = playerImg.width * PLAYER_SCALE;
        const drawH = playerImg.height * PLAYER_SCALE;
        const drawX = p.x;
        const drawY = p.y - drawH; // 足元を ground に合わせる
        ctx.drawImage(playerImg, drawX, drawY, drawW, drawH);
      } else {
        // ロード中のフォールバック
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x + 20, p.y - 40, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // 障害物描画（画像 or 四角）
      state.obstacles.forEach((obs) => {
        let img: HTMLImageElement | null = null;

        switch (obs.type) {
          case "GROUND_SMALL":
            img = assetState.obsGroundSmall;
            break;
          case "GROUND_LARGE":
            img = assetState.obsGroundLarge;
            break;
          case "FLYING_SMALL":
            img = assetState.obsFlySmall;
            break;
          case "FLYING_LARGE":
            img = assetState.obsFlyLarge;
            break;
        }

        if (img) {
          ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
        } else {
          ctx.fillStyle = "#166534";
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        }
      });

      ctx.restore();

      requestRef.current = requestAnimationFrame(update);
    },
    [onGameOver, currentScore]
  );

  // リサイズ対応
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) setupCanvas(canvasRef.current);
    };
    window.addEventListener("resize", handleResize);
    if (canvasRef.current) setupCanvas(canvasRef.current);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ループ開始 / 終了
  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div
      className="relative w-full h-full bg-slate-200 overflow-hidden select-none"
      onMouseDown={startJump}
      onMouseUp={endJump}
      onTouchStart={startJump}
      onTouchEnd={endJump}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm z-10">
        SCORE: {Math.floor(scoreRef.current).toString().padStart(5, "0")}
      </div>
    </div>
  );
};

export default GameScreen;
