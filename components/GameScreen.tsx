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

// ===== 論理キャンバスサイズ =====
const CANVAS_W = 800;
const CANVAS_H = 450;

const GROUND_HEIGHT = 80;
const GROUND_Y = CANVAS_H - GROUND_HEIGHT;

// ===== プレイヤー =====
const PLAYER_WIDTH = 80;   // 基本幅（アスペクトは画像から計算）
const PLAYER_MAX_HEIGHT = 170;

// Dino Run っぽい物理
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;

// スピード関連
const INITIAL_SPEED = 4;      // 最初かなりゆっくり
const MAX_SPEED = 22;
const ACCELERATION = 0.02;

// 敵出現
const SPAWN_BASE_MIN = 60;
const SPAWN_BASE_VAR = 80;

// 当たり後に止めておく時間
const GAME_OVER_PAUSE_MS = 1000;

// キャラの足元を少しだけ上げて、障害物と揃える用オフセット（マイナスで上方向）
const PLAYER_FOOT_OFFSET_Y = -8;

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

    // スクロール用
    speed: INITIAL_SPEED,
    frameCount: 0,
    nextSpawnThreshold: SPAWN_BASE_MIN,
    bgFarOffset: 0,
    bgMidOffset: 0,
    groundOffset: 0,

    player: {
      x: 120,
      y: GROUND_Y,
      dy: 0,
      isJumping: false,
      width: PLAYER_WIDTH,
      height: 140,
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

      // キャラの高さを画像比率から決め直しておく
      if (chara1) {
        const aspect = chara1.height / chara1.width;
        const h = Math.min(PLAYER_WIDTH * aspect, PLAYER_MAX_HEIGHT);
        gameState.current.player.height = h;
      }
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
      state.player.animState = "jump";
    }
  }, []);

  // ===== ジャンプボタン離し =====
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
      const assets = assetsRef.current;

      // スコア更新
      if (state.isPlaying) {
        scoreRef.current +=
          0.1 * (state.speed / INITIAL_SPEED) * (dtMs / 16.67);
        const s = Math.floor(scoreRef.current);
        if (s !== currentScore) setCurrentScore(s);
      }

      // ===== 状態更新 =====
      if (state.isPlaying) {
        // スピードアップ
        state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION);

        // 背景スクロール（右→左へ）
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
          let width = 30;
          let height = 30;
          let yPos = GROUND_Y - height;

          if (r < 0.4) {
            type = "GROUND_SMALL";
            width = 36;
            height = 46;
            yPos = GROUND_Y - height;
          } else if (r < 0.7) {
            type = "GROUND_LARGE";
            width = 42;
            height = 72;
            yPos = GROUND_Y - height;
          } else if (r < 0.9) {
            // 小さい飛び障害物：プレイヤーの下をくぐれる高さ
            type = "FLYING_SMALL";
            width = 70;
            height = 40;
            yPos = GROUND_Y - 90; // 低めを飛ぶ
          } else {
            // 大きい飛び障害物：しっかりジャンプすれば越えられる高さ
            type = "FLYING_LARGE";
            width = 90;
            height = 55;
            yPos = GROUND_Y - 120;
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
        const p = state.player;
        const pLeft = p.x + 10;
        const pRight = p.x + p.width - 10;
        const pBottom = p.y + PLAYER_FOOT_OFFSET_Y; // 実際の足位置で判定
        const pTop = pBottom - p.height + 10;

        for (const obs of state.obstacles) {
          const oLeft = obs.x + 8;
          const oRight = obs.x + obs.width - 8;
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
              // 1秒ほどその場で止めてから GameOver を通知
              const finalScore = Math.floor(scoreRef.current);
              setTimeout(() => {
                onGameOver(finalScore);
              }, GAME_OVER_PAUSE_MS);
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
      }

      // プレイヤー描画（縦横比維持）
      const p = state.player;
      const feetY = p.y + PLAYER_FOOT_OFFSET_Y;
      let playerImg: HTMLImageElement | null = null;

      if (p.animState === "die") {
        playerImg = assets.charaDie;
      } else if (p.animState === "jump") {
        playerImg = assets.charaRun1;
      } else {
        playerImg = p.runFrame === 0 ? assets.charaRun1 : assets.charaRun2;
      }

      if (playerImg) {
        const aspect = playerImg.height / playerImg.width;
        const drawW = p.width;
        const drawH = drawW * aspect;
        const topY = feetY - drawH;

        ctx.drawImage(
          playerImg,
          0,
          0,
          playerImg.width,
          playerImg.height,
          p.x,
          topY,
          drawW,
          drawH
        );
      } else {
        const topY = feetY - p.height;
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, topY, p.width, p.height);
      }

      // 敵
      state.obstacles.forEach((obs) => {
        let img: HTMLImageElement | null = null;
        if (obs.type === "GROUND_SMALL") img = assets.obsGroundSmall;
        else if (obs.type === "GROUND_LARGE") img = assets.obsGroundLarge;
        else if (obs.type === "FLYING_SMALL") img = assets.obsFlySmall;
        else img = assets.obsFlyLarge;

        if (img) {
          // 縦横比維持
          const aspect = img.height / img.width;
          const drawW = obs.width;
          const drawH = drawW * aspect;
          const topY = obs.y - (drawH - obs.height);

          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            obs.x,
            topY,
            drawW,
            drawH
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
      {/* ゲーム画面。スマホで足元が見えるように少し上にオフセット */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            border: "4px solid #ffd800",
            boxSizing: "content-box",
            transform: "translateY(-40px)", // ここで全体を少し上に持ち上げる
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

      {/* スコア */}
      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm z-10">
        SCORE: {Math.floor(scoreRef.current).toString().padStart(5, "0")}
      </div>
    </div>
  );
};

export default GameScreen;
