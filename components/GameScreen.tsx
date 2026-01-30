import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ASSETS } from "../assets";

// ==== 型定義 ====

type ObstacleType = "GROUND_SMALL" | "GROUND_LARGE" | "FLYING_SMALL" | "FLYING_LARGE";

interface Obstacle {
  type: ObstacleType;
  x: number;
  y: number; // top
  width: number;
  height: number;
  markedForDeletion: boolean;
}

interface PlayerState {
  x: number;
  y: number; // feet position (ground 基準)
  dy: number;
  isJumping: boolean;
  width: number;
  height: number;
}

type PlayerAnimation = "RUN" | "JUMP" | "DIE";

interface GameScreenProps {
  onGameOver?: (score: number) => void;
}

// ==== ヘルパー ====

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("Failed to load image:", src);
      resolve(null);
    };
  });
};

// ==== 定数（物理・ゲームバランス） ====
// Dino Run っぽい感覚になるように調整してあるので
// 細かくいじりたくなったらここだけ触れば OK

const CONFIG = {
  logicalHeight: 300,      // ゲーム内の仮想高さ
  gravity: 0.6,            // 重力（+方向が下）
  jumpStrength: -11,       // 初速（マイナスで上方向）
  initialSpeed: 5,         // 開始時スピード
  maxSpeed: 22,            // 上限スピード
  acceleration: 0.003,     // 毎フレームのスピード増加
  baseScoreRate: 0.1,      // スコア加算のベース
  runFrameInterval: 0.12,  // RUN アニメのフレーム切替秒
};

// ==== 本体コンポーネント ====

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);

  const [currentScore, setCurrentScore] = useState(0);

  // 画像
  const bgFarRef = useRef<HTMLImageElement | null>(null);
  const bgMidRef = useRef<HTMLImageElement | null>(null);
  const groundRef = useRef<HTMLImageElement | null>(null);
  const obstacleImagesRef = useRef<Record<ObstacleType, HTMLImageElement | null>>({
    GROUND_SMALL: null,
    GROUND_LARGE: null,
    FLYING_SMALL: null,
    FLYING_LARGE: null,
  });
  const playerSpritesRef = useRef<(HTMLImageElement | null)[]>([null, null, null]);

  const assetsLoadedRef = useRef(false);

  // ゲーム状態
  const gameState = useRef({
    isPlaying: true,
    speed: CONFIG.initialSpeed,
    frameCount: 0,
    bgFarOffset: 0,
    bgMidOffset: 0,
    nextSpawnThreshold: 0,
    player: {
      x: 50,
      y: 0, // 後で groundY に合わせる
      dy: 0,
      isJumping: false,
      width: ASSETS.PLAYER.SPRITES[0].width,
      height: ASSETS.PLAYER.SPRITES[0].height,
    } as PlayerState,
    obstacles: [] as Obstacle[],
    playerAnimation: "RUN" as PlayerAnimation,
    runFrameIndex: 0,     // 0 or 1（chara_1 / chara_2）
    runFrameTimer: 0,     // 経過秒
    playerDead: false,
  });

  // ===== Canvas セットアップ =====

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

  // ===== アセット読み込み =====

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
        chara1,
        chara2,
        chara3,
      ] = await Promise.all([
        loadImage(ASSETS.BACKGROUND.FAR.path),
        loadImage(ASSETS.BACKGROUND.MID.path),
        loadImage(ASSETS.GROUND.path),
        loadImage(ASSETS.OBSTACLES.GROUND_SMALL.path),
        loadImage(ASSETS.OBSTACLES.GROUND_LARGE.path),
        loadImage(ASSETS.OBSTACLES.FLYING_SMALL.path),
        loadImage(ASSETS.OBSTACLES.FLYING_LARGE.path),
        loadImage(ASSETS.PLAYER.SPRITES[0].path),
        loadImage(ASSETS.PLAYER.SPRITES[1].path),
        loadImage(ASSETS.PLAYER.SPRITES[2].path),
      ]);

      bgFarRef.current = bgFar;
      bgMidRef.current = bgMid;
      groundRef.current = ground;
      obstacleImagesRef.current = {
        GROUND_SMALL: obsGS,
        GROUND_LARGE: obsGL,
        FLYING_SMALL: obsFS,
        FLYING_LARGE: obsFL,
      };
      playerSpritesRef.current = [chara1, chara2, chara3];

      assetsLoadedRef.current = true;

      // ground の上に立つように、初期足位置をセット
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const scale = rect.height / CONFIG.logicalHeight;
      const groundHeight = CONFIG.logicalHeight * 0.15;
      const groundY = CONFIG.logicalHeight - groundHeight;

      const st = gameState.current;
      st.player.y = groundY; // 足位置
    };

    loadAssets();
  }, []);

  // ===== 入力（ジャンプ） =====

  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = CONFIG.jumpStrength;
      state.player.isJumping = true;
      state.playerAnimation = "JUMP";
      state.runFrameTimer = 0;
    }
  }, []);

  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      // 押しっぱなしで高くなりすぎないように、途中で話したら減速
      state.player.dy = state.player.dy * 0.45;
    }
  }, []);

  // ===== メインループ =====

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

      const dt =
        (time - (lastTimeRef.current || time)) / 1000;
      lastTimeRef.current = time;

      const state = gameState.current;
      const parent = canvas.parentElement;
      if (!parent) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      const rect = parent.getBoundingClientRect();
      const scale = rect.height / CONFIG.logicalHeight;
      const logicalWidth = rect.width / scale;

      const groundHeight = CONFIG.logicalHeight * 0.15;
      const groundY = CONFIG.logicalHeight - groundHeight;

      // ===== 更新 =====

      if (state.isPlaying && assetsLoadedRef.current) {
        // スピード & スコア
        state.speed = Math.min(
          CONFIG.maxSpeed,
          state.speed + CONFIG.acceleration
        );

        scoreRef.current +=
          CONFIG.baseScoreRate *
          (state.speed / CONFIG.initialSpeed);

        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) {
          setCurrentScore(s);
        }

        // 背景オフセット
        state.bgFarOffset -= state.speed * 0.1;
        state.bgMidOffset -= state.speed * 0.25;

        const farWidth =
          ASSETS.BACKGROUND.FAR.width *
          (CONFIG.logicalHeight /
            ASSETS.BACKGROUND.FAR.height);
        const midWidth =
          ASSETS.BACKGROUND.MID.width *
          (CONFIG.logicalHeight /
            ASSETS.BACKGROUND.MID.height);

        if (state.bgFarOffset <= -farWidth)
          state.bgFarOffset += farWidth;
        if (state.bgMidOffset <= -midWidth)
          state.bgMidOffset += midWidth;

        // プレイヤー物理（y は足位置）
        state.player.dy += CONFIG.gravity;
        state.player.y += state.player.dy;

        if (state.player.y > groundY) {
          state.player.y = groundY;
          state.player.dy = 0;

          if (state.player.isJumping) {
            state.player.isJumping = false;
            if (!state.playerDead) {
              state.playerAnimation = "RUN";
            }
          }
        }

        // RUN アニメーション
        if (state.playerAnimation === "RUN") {
          state.runFrameTimer += dt;
          if (state.runFrameTimer > CONFIG.runFrameInterval) {
            state.runFrameTimer = 0;
            state.runFrameIndex =
              state.runFrameIndex === 0 ? 1 : 0;
          }
        } else if (
          state.playerAnimation === "JUMP" ||
          state.playerAnimation === "DIE"
        ) {
          // JUMP / DIE は固定フレーム
          state.runFrameIndex = 0;
        }

        // 障害物スポーン
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const typeRand = Math.random();
          let type: ObstacleType = "GROUND_SMALL";
          if (typeRand < 0.4) type = "GROUND_SMALL";
          else if (typeRand < 0.7) type = "GROUND_LARGE";
          else if (typeRand < 0.9) type = "FLYING_SMALL";
          else type = "FLYING_LARGE";

          const asset = ASSETS.OBSTACLES[type];
          let width = asset.width;
          let height = asset.height;
          let yPos = groundY - height;

          if (type === "FLYING_SMALL") {
            yPos = groundY - height - 60;
          } else if (type === "FLYING_LARGE") {
            yPos = groundY - height - 80;
          }

          state.obstacles.push({
            type,
            x: logicalWidth + 50,
            y: yPos,
            width,
            height,
            markedForDeletion: false,
          });

          state.nextSpawnThreshold =
            60 + Math.random() * 80;
        }

        // 障害物更新 & 当たり判定
        const playerTop =
          state.player.y - state.player.height;
        const playerBottom = state.player.y;
        const playerLeft = state.player.x;
        const playerRight =
          state.player.x + state.player.width;

        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;

          if (obs.x + obs.width < -100) {
            obs.markedForDeletion = true;
          }

          const pPadding = 10;
          const left = playerLeft + pPadding;
          const right = playerRight - pPadding;
          const top = playerTop + pPadding;
          const bottom = playerBottom;

          const hit =
            left < obs.x + obs.width &&
            right > obs.x &&
            top < obs.y + obs.height &&
            bottom > obs.y;

          if (hit && state.isPlaying) {
            state.isPlaying = false;
            state.playerDead = true;
            state.playerAnimation = "DIE";
            state.runFrameIndex = 2; // chara_3
            if (onGameOver) {
              onGameOver(Math.floor(scoreRef.current));
            }
          }
        });

        state.obstacles =
          state.obstacles.filter(
            (o) => !o.markedForDeletion
          );
      }

      // ===== 描画 =====

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.scale(scale, scale);

      // 背景ベース色
      ctx.fillStyle = "#1f2933"; // 濃い青（外枠の色）
      ctx.fillRect(
        0,
        0,
        logicalWidth,
        CONFIG.logicalHeight
      );

      // ゲームエリア（薄い水色）
      ctx.fillStyle = "#bfdbfe";
      ctx.fillRect(
        0,
        0,
        logicalWidth,
        CONFIG.logicalHeight
      );

      // 遠景・中景
      if (assetsLoadedRef.current) {
        const bgFarImg = bgFarRef.current;
        const bgMidImg = bgMidRef.current;

        if (bgFarImg) {
          const baseScale =
            CONFIG.logicalHeight /
            ASSETS.BACKGROUND.FAR.height;
          const drawWidth =
            ASSETS.BACKGROUND.FAR.width * baseScale;

          for (let i = -1; i < 3; i++) {
            ctx.drawImage(
              bgFarImg,
              state.bgFarOffset + i * drawWidth,
              0,
              drawWidth,
              CONFIG.logicalHeight
            );
          }
        }

        if (bgMidImg) {
          const baseScale =
            CONFIG.logicalHeight /
            ASSETS.BACKGROUND.MID.height;
          const drawWidth =
            ASSETS.BACKGROUND.MID.width * baseScale;

          for (let i = -1; i < 3; i++) {
            ctx.drawImage(
              bgMidImg,
              state.bgMidOffset + i * drawWidth,
              0,
              drawWidth,
              CONFIG.logicalHeight
            );
          }
        }
      }

      // 地面
      const groundImg = groundRef.current;
      const tileWidth =
        ASSETS.GROUND.tileWidth || 100;
      const groundTileWorldWidth = tileWidth;
      const offsetX =
        -((state.frameCount * state.speed) %
          groundTileWorldWidth) || 0;

      if (groundImg) {
        for (
          let i = -1;
          i <
          Math.ceil(
            logicalWidth / groundTileWorldWidth
          ) +
            1;
          i++
        ) {
          ctx.drawImage(
            groundImg,
            offsetX + i * groundTileWorldWidth,
            groundY,
            groundTileWorldWidth,
            groundHeight
          );
        }
      } else {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(
          0,
          groundY,
          logicalWidth,
          groundHeight
        );
      }

      // プレイヤー描画
      if (assetsLoadedRef.current) {
        let spriteIndex = 0;
        if (state.playerAnimation === "RUN") {
          spriteIndex = state.runFrameIndex; // 0 or 1
        } else if (state.playerAnimation === "JUMP") {
          spriteIndex = 0;
        } else if (state.playerAnimation === "DIE") {
          spriteIndex = 2;
        }

        const img = playerSpritesRef.current[spriteIndex];
        const meta =
          ASSETS.PLAYER.SPRITES[spriteIndex];

        // meta.width/height は「ゲーム内の見た目サイズ」として使う
        const drawW = meta.width;
        const drawH = meta.height;

        const x = state.player.x;
        const yTop = state.player.y - drawH;

        if (img) {
          ctx.drawImage(
            img,
            x,
            yTop,
            drawW,
            drawH
          );
        } else {
          // 読み込み前のフォールバック
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(x, yTop, drawW, drawH);
        }
      }

      // 障害物描画
      state.obstacles.forEach((obs) => {
        const img =
          obstacleImagesRef.current[obs.type];
        if (img) {
          ctx.drawImage(
            img,
            obs.x,
            obs.y,
            obs.width,
            obs.height
          );
        } else {
          ctx.fillStyle = "#2563eb";
          ctx.fillRect(
            obs.x,
            obs.y,
            obs.width,
            obs.height
          );
        }
      });

      ctx.restore();

      requestRef.current =
        requestAnimationFrame(update);
    },
    [currentScore, onGameOver]
  );

  // ===== Resize & ループ開始 =====

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        setupCanvas(canvasRef.current);
      }
    };

    window.addEventListener("resize", handleResize);
    if (canvasRef.current) {
      setupCanvas(canvasRef.current);
    }

    requestRef.current = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [update]);

  // ===== JSX =====

  return (
    <div
      className="relative w-full h-full bg-slate-900 flex items-center justify-center select-none"
      onMouseDown={startJump}
      onMouseUp={endJump}
      onTouchStart={startJump}
      onTouchEnd={endJump}
    >
      <div className="border-4 border-yellow-400 w-[70vw] max-w-[960px] aspect-[4/2] bg-slate-200 relative">
        <canvas
          ref={canvasRef}
          className="block w-full h-full"
        />
        <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm z-10">
          SCORE:{" "}
          {Math.floor(scoreRef.current)
            .toString()
            .padStart(5, "0")}
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
