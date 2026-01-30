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
  y: number;          // 当たり判定用：上端
  width: number;
  height: number;
  markedForDeletion: boolean;
};

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// ===== キャンバス論理サイズ =====
const CANVAS_W = 960;
const CANVAS_H = 540;

// ground は画像を 1 タイルとして貼り付ける前提
const GROUND_HEIGHT = 110;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

// 足が乗るライン（黄土色の土の少し上を想定）
const FOOT_LINE_Y = GROUND_Y + 12;

// ===== プレイヤー =====
const PLAYER_TARGET_HEIGHT = 130; // 「今いい感じ」くらいの見た目サイズ
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;

// ===== スクロール・ゲームスピード =====
const INITIAL_SPEED = 5.0;
const MAX_SPEED = 26;
const ACCELERATION = 0.03;

// ===== 敵 =====
const SPAWN_BASE_MIN = 60;
const SPAWN_BASE_VAR = 80;

// 高さだけ指定して、幅は画像のアスペクト比から自動計算
const OBSTACLE_TARGET_HEIGHT = {
  GROUND_SMALL: 80,
  GROUND_LARGE: 105,   // でかすぎない程度に
  FLYING_SMALL: 70,
  FLYING_LARGE: 80,
} as const;

// 飛んでいる系の「下端」の高さ（下を潜れる高さ）
const FLYING_BOTTOM_Y = {
  FLYING_SMALL: FOOT_LINE_Y - 55,
  FLYING_LARGE: FOOT_LINE_Y - 70,
} as const;

// GameOver してから止めておく時間
const DEATH_FREEZE_MS = 1000;

type PlayerAnim = "run" | "jump" | "die";

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

  const [currentScore, setCurrentScore] = useState(0);
  const scoreRef = useRef<number>(0);

  const deathTimeRef = useRef<number | null>(null);

  const gameState = useRef({
    isPlaying: true,
    hasGameOverSent: false,

    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,
    bgFarOffset: 0,
    bgMidOffset: 0,
    groundOffset: 0,

    player: {
      x: 180,
      bottomY: FOOT_LINE_Y, // 当たり判定用の「足元」
      dy: 0,
      isJumping: false,
      anim: "run" as PlayerAnim,
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

  // ===== 画像読み込み =====
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

  // ===== ジャンプ開始 =====
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = JUMP_STRENGTH;
      state.player.isJumping = true;
      state.player.anim = "jump";
    }
  }, []);

  // ===== ジャンプボタン離し =====
  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy *= 0.45;
    }
  }, []);

  // ===== 敵のサイズ計算（アスペクト比維持） =====
  const decideObstacleSize = (
    type: ObstacleType,
    assets: typeof assetsRef.current
  ) => {
    const targetH = OBSTACLE_TARGET_HEIGHT[type];
    let img: HTMLImageElement | null = null;
    if (type === "GROUND_SMALL") img = assets.obsGroundSmall;
    else if (type === "GROUND_LARGE") img = assets.obsGroundLarge;
    else if (type === "FLYING_SMALL") img = assets.obsFlySmall;
    else img = assets.obsFlyLarge;

    if (!img) {
      // 画像未ロード時の適当サイズ
      return { width: targetH, height: targetH };
    }

    const scale = targetH / img.height;
    const width = img.width * scale;
    const height = img.height * scale;
    return { width, height };
  };

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
      const assets = assetsRef.current;

      // 死亡後の停止時間制御
      if (!state.isPlaying && deathTimeRef.current != null) {
        if (time - deathTimeRef.current > DEATH_FREEZE_MS) {
          // ループ止める
          cancelAnimationFrame(requestRef.current);
          return;
        }
      }

      // スコア更新
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
        state.player.bottomY += state.player.dy;

        if (state.player.bottomY > FOOT_LINE_Y) {
          state.player.bottomY = FOOT_LINE_Y;
          state.player.dy = 0;
          if (state.player.isJumping) {
            state.player.isJumping = false;
            state.player.anim = "run";
          }
        }

        // 走りアニメーション
        if (state.player.anim === "run") {
          state.player.runAnimTimer += dtMs;
          if (state.player.runAnimTimer > 120) {
            state.player.runAnimTimer = 0;
            state.player.runFrame =
              state.player.runFrame === 0 ? 1 : 0;
          }
        } else {
          state.player.runAnimTimer = 0;
          state.player.runFrame = 0;
        }

        // 敵出現
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";
          if (r < 0.45) type = "GROUND_SMALL";
          else if (r < 0.7) type = "GROUND_LARGE";
          else if (r < 0.9) type = "FLYING_SMALL";
          else type = "FLYING_LARGE";

          const { width, height } = decideObstacleSize(type, assets);

          // y は当たり判定用 top
          let bottomY = FOOT_LINE_Y;
          if (type === "FLYING_SMALL" || type === "FLYING_LARGE") {
            bottomY = FLYING_BOTTOM_Y[type];
          }
          const y = bottomY - height;

          state.obstacles.push({
            type,
            x: CANVAS_W + 60,
            y,
            width,
            height,
            markedForDeletion: false,
          });

          state.nextSpawnThreshold =
            SPAWN_BASE_MIN + Math.random() * SPAWN_BASE_VAR;
        }

        // 敵移動
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -100) {
            obs.markedForDeletion = true;
          }
        });
        state.obstacles = state.obstacles.filter(
          (o) => !o.markedForDeletion
        );

        // 当たり判定（少し小さめの当たり判定）
        const p = state.player;
        const playerPaddingX = 10;
        const playerPaddingTop = 5;
        const playerPaddingBottom = 5;

        // プレイヤーの描画用高さをここでも計算
        const playerImg =
          p.anim === "die"
            ? assets.charaDie
            : p.anim === "jump"
            ? assets.charaRun1
            : p.runFrame === 0
            ? assets.charaRun1
            : assets.charaRun2;

        let playerDrawH = PLAYER_TARGET_HEIGHT;
        let playerDrawW = PLAYER_TARGET_HEIGHT;
        if (playerImg) {
          const scale = PLAYER_TARGET_HEIGHT / playerImg.height;
          playerDrawH = playerImg.height * scale;
          playerDrawW = playerImg.width * scale;
        }

        const pBottom = p.bottomY;
        const pTop = pBottom - playerDrawH;

        const pLeft = p.x + playerPaddingX;
        const pRight = p.x + playerDrawW - playerPaddingX;
        const pTopHit = pTop + playerPaddingTop;
        const pBottomHit = pBottom - playerPaddingBottom;

        for (const obs of state.obstacles) {
          const obsPadding = 8;
          const oLeft = obs.x + obsPadding;
          const oRight = obs.x + obs.width - obsPadding;
          const oTop = obs.y + obsPadding;
          const oBottom = obs.y + obs.height - obsPadding;

          const hit =
            pLeft < oRight &&
            pRight > oLeft &&
            pTopHit < oBottom &&
            pBottomHit > oTop;

          if (hit) {
            state.isPlaying = false;
            state.player.anim = "die";
            deathTimeRef.current = time;
            if (!state.hasGameOverSent) {
              state.hasGameOverSent = true;
              onGameOver(Math.floor(scoreRef.current));
            }
            break;
          }
        }
      }

      // ===== 描画 =====
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // ベース空色
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景 FAR（右→左スクロール）
      if (assets.bgFar) {
        const img = assets.bgFar;
        const drawH = CANVAS_H - GROUND_HEIGHT;
        const drawW = CANVAS_W;
        const offset =
          ((state.bgFarOffset % drawW) + drawW) % drawW;
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
        const offset =
          ((state.bgMidOffset % drawW) + drawW) % drawW;
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
        const offset =
          ((state.groundOffset % tileW) + tileW) % tileW;
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
      }

      // 敵（★キャラより先に描く＝キャラが前面）
      state.obstacles.forEach((obs) => {
        let img: HTMLImageElement | null = null;
        if (obs.type === "GROUND_SMALL") img = assets.obsGroundSmall;
        else if (obs.type === "GROUND_LARGE")
          img = assets.obsGroundLarge;
        else if (obs.type === "FLYING_SMALL")
          img = assets.obsFlySmall;
        else img = assets.obsFlyLarge;

        const drawY = obs.y - 3; // 少しだけ上に

        if (img) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            obs.x,
            drawY,
            obs.width,
            obs.height
          );
        } else {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(obs.x, drawY, obs.width, obs.height);
        }
      });

      // プレイヤー（★最後に描く＝一番前面）
      const p = state.player;
      const pImg =
        p.anim === "die"
          ? assets.charaDie
          : p.anim === "jump"
          ? assets.charaRun1
          : p.runFrame === 0
          ? assets.charaRun1
          : assets.charaRun2;

      let drawH = PLAYER_TARGET_HEIGHT;
      let drawW = PLAYER_TARGET_HEIGHT;
      if (pImg) {
        const scale = PLAYER_TARGET_HEIGHT / pImg.height;
        drawH = pImg.height * scale;
        drawW = pImg.width * scale;
      }

      const bottomY = p.bottomY;
      const topY = bottomY - drawH - 3; // ★キャラを 3px 上に

      if (pImg) {
        ctx.drawImage(
          pImg,
          0,
          0,
          pImg.width,
          pImg.height,
          p.x,
          topY,
          drawW,
          drawH
        );
      } else {
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, topY, drawW, drawH);
      }

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
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
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
