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
  y: number; // 描画用: 下端が ground 近くになるように調整済み
  width: number;
  height: number;
  markedForDeletion: boolean;
};

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// =====================
// 定数
// =====================

// 論理キャンバスサイズ
const CANVAS_W = 800;
const CANVAS_H = 450;

// ground の高さ（画像をこの高さにフィットさせる）
const GROUND_HEIGHT = 80;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

// 「足が接地するライン」
// → ground 画像の少し上（黄土色のちょい上あたり）
const PLAYER_BASE_Y = GROUND_Y + 18;

// プレイヤーの論理サイズ（アスペクトは画像から決めるので「基準スケール」として扱う）
const PLAYER_BASE_WIDTH = 70;
const PLAYER_BASE_HEIGHT = 110;

// 物理パラメータ（Dino Run っぽく）
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;

// スクロール速度
const INITIAL_SPEED = 5;   // 少し遅めスタート
const MAX_SPEED = 22;
const ACCELERATION = 0.03;

// 敵の出現間隔（フレーム数基準）
const SPAWN_BASE_MIN = 70;
const SPAWN_BASE_VAR = 80;

// ヒット後にゲーム画面を止めておく時間（ms）
const GAME_OVER_DELAY = 1000;

// プレイヤースプライト（assetConfig からパスだけもらう）
const PLAYER_SPRITES = {
  RUN1: assetConfig.PLAYER.SPRITES.RUN_1.path,
  RUN2: assetConfig.PLAYER.SPRITES.RUN_2.path,
  JUMP: assetConfig.PLAYER.SPRITES.JUMP.path,
  DIE: assetConfig.PLAYER.SPRITES.DIE.path,
} as const;

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
    gameOverTimerMs: 0,

    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,
    bgFarOffset: 0,
    bgMidOffset: 0,
    groundOffset: 0,

    player: {
      x: 130,
      y: PLAYER_BASE_Y, // 足元の Y（下端）
      dy: 0,
      isJumping: false,
      width: PLAYER_BASE_WIDTH,
      height: PLAYER_BASE_HEIGHT,
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
    charaJump: null as HTMLImageElement | null,
    charaDie: null as HTMLImageElement | null,
    loaded: false,
  });

  // =====================
  // 画像読み込み
  // =====================
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
        charaJump,
        chara3,
      ] = await Promise.all([
        loadImage(assetConfig.BACKGROUND.FAR.path),
        loadImage(assetConfig.BACKGROUND.MID.path),
        loadImage(assetConfig.GROUND.path),
        loadImage(assetConfig.OBSTACLES.GROUND_SMALL.path),
        loadImage(assetConfig.OBSTACLES.GROUND_LARGE.path),
        loadImage(assetConfig.OBSTACLES.FLYING_SMALL.path),
        loadImage(assetConfig.OBSTACLES.FLYING_LARGE.path),
        loadImage(PLAYER_SPRITES.RUN1),
        loadImage(PLAYER_SPRITES.RUN2),
        loadImage(PLAYER_SPRITES.JUMP),
        loadImage(PLAYER_SPRITES.DIE),
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
        charaJump,
        charaDie: chara3,
        loaded: true,
      };
    };

    loadAll();
  }, []);

  // =====================
  // ジャンプ開始
  // =====================
  const startJump = useCallback(() => {
    const state = gameState.current;
    if (!state.isPlaying) return;

    if (!state.player.isJumping) {
      state.player.dy = JUMP_STRENGTH;
      state.player.isJumping = true;
      state.player.animState = "jump";
    }
  }, []);

  // ジャンプボタン離し（長押しで高さ調整）
  const endJump = useCallback(() => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy = state.player.dy * 0.45;
    }
  }, []);

  // =====================
  // メインループ
  // =====================
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

      // ゲームオーバー中のタイマー
      if (!state.isPlaying) {
        if (!state.hasGameOverSent) {
          state.gameOverTimerMs -= dtMs;
          if (state.gameOverTimerMs <= 0) {
            state.hasGameOverSent = true;
            onGameOver(Math.floor(scoreRef.current));
          }
        }
      }

      // スコア更新
      if (state.isPlaying) {
        scoreRef.current +=
          0.08 * (state.speed / INITIAL_SPEED) * (dtMs / 16.67);
        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) setCurrentScore(s);
      }

      // =====================
      // 状態更新
      // =====================
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

        // 地面との当たり
        if (state.player.y > PLAYER_BASE_Y) {
          state.player.y = PLAYER_BASE_Y;
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

        // 敵出現
        state.frameCount++;
        if (state.frameCount > state.nextSpawnThreshold) {
          state.frameCount = 0;

          const r = Math.random();
          let type: ObstacleType = "GROUND_SMALL";

          // 元画像のアスペクト比を維持しつつスケール
          const gs = assetConfig.OBSTACLES.GROUND_SMALL;
          const gl = assetConfig.OBSTACLES.GROUND_LARGE;
          const fs = assetConfig.OBSTACLES.FLYING_SMALL;
          const fl = assetConfig.OBSTACLES.FLYING_LARGE;

          let width = 60;
          let height = 60;
          let yPos = PLAYER_BASE_Y;

          if (r < 0.4) {
            type = "GROUND_SMALL";
            const scale = 0.45;
            width = gs.width * scale;
            height = gs.height * scale;
            yPos = PLAYER_BASE_Y; // 足元ライン
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
            const scale = 0.4;
            width = gl.width * scale;
            height = gl.height * scale;
            yPos = PLAYER_BASE_Y;
          } else if (r < 0.9) {
            type = "FLYING_SMALL";
            const scale = 0.5;
            width = fs.width * scale;
            height = fs.height * scale;
            // たまに下をくぐれる高さ
            yPos = PLAYER_BASE_Y - height - 30;
          } else {
            type = "FLYING_LARGE";
            const scale = 0.45;
            width = fl.width * scale;
            height = fl.height * scale;
            // かなり下をくぐりやすい高さ
            yPos = PLAYER_BASE_Y - height - 40;
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

        // 敵移動
        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;
          if (obs.x + obs.width < -100) {
            obs.markedForDeletion = true;
          }
        });
        state.obstacles = state.obstacles.filter((o) => !o.markedForDeletion);

        // =====================
        // 当たり判定（ヒットボックスを小さめに）
        // =====================
        const p = state.player;
        const pHitLeft = p.x + p.width * 0.2;
        const pHitRight = p.x + p.width * 0.8;
        const pHitBottom = p.y;
        const pHitTop = p.y - p.height * 0.85;

        for (const obs of state.obstacles) {
          const oHitLeft = obs.x + obs.width * 0.15;
          const oHitRight = obs.x + obs.width * 0.85;
          const oHitBottom = obs.y;
          const oHitTop = obs.y - obs.height * 0.9;

          const hit =
            pHitLeft < oHitRight &&
            pHitRight > oHitLeft &&
            pHitTop < oHitBottom &&
            pHitBottom > oHitTop;

          if (hit) {
            state.isPlaying = false;
            state.player.animState = "die";
            state.gameOverTimerMs = GAME_OVER_DELAY;
            break;
          }
        }
      }

      // =====================
      // 描画
      // =====================
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 背景色（空）が透けたとき用
      ctx.fillStyle = "#e2f5ff";
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

      // ground
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

      // 敵（先に描画：このあとプレイヤーを前面に）
      state.obstacles.forEach((obs) => {
        let img: HTMLImageElement | null = null;
        if (obs.type === "GROUND_SMALL") img = assets.obsGroundSmall;
        else if (obs.type === "GROUND_LARGE") img = assets.obsGroundLarge;
        else if (obs.type === "FLYING_SMALL") img = assets.obsFlySmall;
        else img = assets.obsFlyLarge;

        const drawX = obs.x;
        const drawY = obs.y - obs.height; // 下端基準

        if (img) {
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            drawX,
            drawY,
            obs.width,
            obs.height
          );
        } else {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(drawX, drawY, obs.width, obs.height);
        }
      });

      // プレイヤー（前面）
      const p = state.player;
      const pyTop = p.y - p.height;
      let playerImg: HTMLImageElement | null = null;

      if (p.animState === "die") {
        playerImg = assets.charaDie;
      } else if (p.animState === "jump") {
        playerImg = assets.charaJump ?? assets.charaRun1;
      } else {
        playerImg = p.runFrame === 0 ? assets.charaRun1 : assets.charaRun2;
      }

      if (playerImg) {
        // 元画像のアスペクト比を維持しつつ拡大
        const aspect = playerImg.width / playerImg.height;
        const targetHeight = p.height;
        const targetWidth = targetHeight * aspect;

        ctx.drawImage(
          playerImg,
          0,
          0,
          playerImg.width,
          playerImg.height,
          p.x,
          pyTop,
          targetWidth,
          targetHeight
        );
      } else {
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, pyTop, p.width, p.height);
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
      {/* 画面下寄せで常に ground と足元が見えるようにする */}
      <div className="absolute inset-0 flex items-end justify-center pb-4">
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
