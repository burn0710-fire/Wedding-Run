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

// ==== キャンバス論理サイズ ====
const CANVAS_W = 800;
const CANVAS_H = 450;

const GROUND_HEIGHT = 80;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

// ==== プレイヤー（当たり判定用の箱）====
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 80;

// ---- 描画オフセット・演出関連 ----
const GAMEOVER_DELAY = 1000;       // 当たり後 1 秒で GameOver
// オブジェクトの画像下端とキャラの画像下端を揃える
const OBSTACLE_FOOT_OFFSET = 40;
const CHAR_FOOT_OFFSET = OBSTACLE_FOOT_OFFSET + 6;


// Dino Run ぽい物理
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;

// スピード関連
const INITIAL_SPEED = 4;
const MAX_SPEED = 26;
const ACCELERATION = 0.02;

// 敵の出現間隔（frame）
const SPAWN_BASE_MIN = 60;
const SPAWN_BASE_VAR = 80;

// === スプライトの元サイズから描画スケール計算 ===
const CHAR_BASE = assetConfig.PLAYER.SPRITES.RUN_1;
// 当たり判定高さ 80 の 1.5 倍くらいに見せる
const CHAR_TARGET_VISUAL_H = PLAYER_HEIGHT * 1.5;
const CHAR_SCALE = CHAR_TARGET_VISUAL_H / CHAR_BASE.height;

// 障害物の見た目スケール（タイプ別）
const OBSTACLE_SCALE_GROUND = 0.40;
const OBSTACLE_SCALE_FLY_SMALL = 0.32;
const OBSTACLE_SCALE_FLY_LARGE = 0.26;

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
      x: 100,
      y: GROUND_Y,
      dy: 0,
      isJumping: false,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      animState: "run" as PlayerAnimState,
      runFrame: 0 as 0 | 1,
      runAnimTimer: 0,
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
      const sprites = assetConfig.PLAYER.SPRITES;

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
        loadImage(sprites.RUN_1.path),
        loadImage(sprites.RUN_2.path),
        loadImage(sprites.DIE.path),
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

        // 背景スクロール（★右→左へ流れるように符号を反転）
        state.bgFarOffset += state.speed * 0.3;
        state.bgMidOffset += state.speed * 0.6;
        state.groundOffset += state.speed;

        // プレイヤー物理
        state.player.dy += GRAVITY;
        state.player.y += state.player.dy;

        // 地面との衝突
        if (state.player.y > GROUND_Y) {
          state.player.y = GROUND_Y;
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

        // 敵の出現
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";

          if (r < 0.4) {
            type = "GROUND_SMALL";
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
          } else if (r < 0.9) {
            type = "FLYING_SMALL";
          } else {
            type = "FLYING_LARGE";
          }

          // 当たり判定用の箱サイズ・高さ（ざっくり）
          let hitW = 40;
          let hitH = 50;
          let yPos = GROUND_Y - hitH + 4;

          if (type === "GROUND_SMALL") {
            hitW = 38;
            hitH = 45;
            yPos = GROUND_Y - hitH + 4;
          } else if (type === "GROUND_LARGE") {
            hitW = 50;
            hitH = 80;
            yPos = GROUND_Y - hitH + 4;
          } else if (type === "FLYING_SMALL") {
            hitW = 35;
            hitH = 28;
            yPos = GROUND_Y - 90;
          } else if (type === "FLYING_LARGE") {
            // 大型は高め＋薄めの当たり判定 → 下をくぐれる
            hitW = 40;
            hitH = 28;
            yPos = GROUND_Y - 120;
          }

          state.obstacles.push({
            type,
            x: CANVAS_W + 50,
            y: yPos,
            width: hitW,
            height: hitH,
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

            if (!state.hasGameOverSent) {
              state.hasGameOverSent = true;
              const finalScore = Math.floor(scoreRef.current);
              setTimeout(() => {
                onGameOver(finalScore);
              }, GAMEOVER_DELAY);
            }
            break;
          }
        }
      }

      // ===== 描画 =====
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 空
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const stateForDraw = gameState.current;

      // 背景 FAR
      if (assets.bgFar) {
        const img = assets.bgFar;
        const drawH = CANVAS_H - GROUND_HEIGHT;
        const drawW = CANVAS_W;
        const offset = ((stateForDraw.bgFarOffset % drawW) + drawW) % drawW;
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
        const offset = ((stateForDraw.bgMidOffset % drawW) + drawW) % drawW;
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
        const offset = ((stateForDraw.groundOffset % tileW) + tileW) % tileW;
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
        ctx.fillRect(0, GROUND_Y, CANVAS_H, GROUND_HEIGHT);
      }

      // ===== プレイヤー描画（縦横比維持）=====
      const p = stateForDraw.player;

      const charVisualW = CHAR_BASE.width * CHAR_SCALE;
      const charVisualH = CHAR_BASE.height * CHAR_SCALE;

      const drawXBase = p.x - (charVisualW - p.width) / 2;
      const drawYBase = p.y - charVisualH + CHAR_FOOT_OFFSET;

      let playerImg: HTMLImageElement | null = null;
      if (p.animState === "die") {
        playerImg = assets.charaDie;
      } else if (p.animState === "jump") {
        playerImg = assets.charaRun1;
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
          drawXBase,
          drawYBase,
          charVisualW,
          charVisualH
        );
      } else {
        ctx.fillStyle = "red";
        ctx.fillRect(drawXBase, drawYBase, charVisualW, charVisualH);
      }

      // ===== 敵（縦横比維持）=====
      stateForDraw.obstacles.forEach((obs) => {
        let cfg = assetConfig.OBSTACLES.GROUND_SMALL;
        let img: HTMLImageElement | null = assets.obsGroundSmall;
        let scale = OBSTACLE_SCALE_GROUND;

        if (obs.type === "GROUND_LARGE") {
          cfg = assetConfig.OBSTACLES.GROUND_LARGE;
          img = assets.obsGroundLarge;
          scale = OBSTACLE_SCALE_GROUND;
        } else if (obs.type === "FLYING_SMALL") {
          cfg = assetConfig.OBSTACLES.FLYING_SMALL;
          img = assets.obsFlySmall;
          scale = OBSTACLE_SCALE_FLY_SMALL;
        } else if (obs.type === "FLYING_LARGE") {
          cfg = assetConfig.OBSTACLES.FLYING_LARGE;
          img = assets.obsFlyLarge;
          scale = OBSTACLE_SCALE_FLY_LARGE;
        }

        const vW = cfg.width * scale;
        const vH = cfg.height * scale;

        const drawX = obs.x - (vW - obs.width) / 2;
        const drawY = obs.y - (vH - obs.height) + OBSTACLE_FOOT_OFFSET;

        if (img) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            drawX,
            drawY,
            vW,
            vH
          );
        } else {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(drawX, drawY, vW, vH);
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
