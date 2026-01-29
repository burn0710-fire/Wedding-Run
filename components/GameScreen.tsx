import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import * as spine from "@esotericsoftware/spine-canvas";

import gameConfigData from "../config/game";
const config = gameConfigData;

// GitHub Pages / ローカル両対応用のベースパス
const base =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env.BASE_URL) ||
  "/Wedding-Run/";

// プレイヤー状態（今はあまり使ってないけど拡張用）
enum PlayerState {
  RUNNING = "RUNNING",
  JUMPING = "JUMPING",
  CRASHED = "CRASHED",
}

// 敵データ
type Enemy = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
};

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 40;
const ENEMY_BASE_SPEED = 220;
const PLAYER_WIDTH = 50;

const CANVAS_W = 800;  // 表示サイズを固定
const CANVAS_H = 450;

const GameScreen: React.FC<{ onGameOver: (score: number) => void }> = ({
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [currentScore, setCurrentScore] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const spineRef = useRef<any>(null);
  const assetsRef = useRef<any>({
    bgFar: null,
    bgMid: null,
    ground: null,
  });

  const playerRef = useRef({
    y: config.canvasHeight - config.groundHeight - config.playerHeight,
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const scrollRef = useRef({
    bgFar: 0,
    bgMid: 0,
    ground: 0,
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const isGameOverRef = useRef(false);

  // 初期化
  useEffect(() => {
    console.log("GameScreen mounted");
    console.log("spine.VERSION:", (spine as any).VERSION);
    console.log("config:", config);

    isGameOverRef.current = false;
    scoreRef.current = 0;
    setCurrentScore(0);

    const init = async () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;

      // Canvas の物理サイズ
      canvas.width = config.canvasWidth;
      canvas.height = config.canvasHeight;

      const loadImg = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            console.log(
              "loaded image:",
              src,
              img.width,
              "x",
              img.height
            );
            resolve(img);
          };
          img.onerror = (e) => {
            console.error("FAILED to load image:", src, e);
            resolve(null);
          };
        });

      // 背景画像
      assetsRef.current.bgFar = await loadImg(
        `${base}assets/images/bg_far.png`
      );
      assetsRef.current.bgMid = await loadImg(
        `${base}assets/images/bg_mid.png`
      );
      assetsRef.current.ground = await loadImg(
        `${base}assets/images/ground.png`
      );

      // Spine AssetManager
      const AssetManager = (spine as any).AssetManager;
      const Downloader = (spine as any).Downloader;

      const assetManager = new AssetManager(
        `${base}assets/spine/player/`,
        new Downloader()
      );

      assetManager.loadText("char_v2.json");
      assetManager.loadTextureAtlas("char_v2.atlas");

      const check = () => {
        if (assetManager.isLoadingComplete()) {
          const atlas = assetManager.get("char_v2.atlas");
          const jsonText = assetManager.get("char_v2.json");
          console.log("Spine assets loaded:", atlas, jsonText);

          try {
            const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
            const skeletonJson = new spine.SkeletonJson(atlasLoader);
            const skeletonData =
              skeletonJson.readSkeletonData(jsonText);

            const skeleton = new spine.Skeleton(skeletonData);
            const state = new spine.AnimationState(
              new spine.AnimationStateData(skeletonData)
            );
            state.setAnimation(0, "run", true);

            const ctx = canvas.getContext("2d");
            if (!ctx) {
              console.error("cannot get 2d context");
              return;
            }

            const renderer = new spine.SkeletonRenderer(ctx);

            spineRef.current = {
              skeleton,
              state,
              renderer,
            };
          } catch (e) {
            console.warn("Spine init error:", e);
          }

          // 敵の初期配置
          const enemyGroundY =
            config.canvasHeight - config.groundHeight - ENEMY_HEIGHT;
          enemiesRef.current = [
            {
              x: config.canvasWidth + 100,
              y: enemyGroundY,
              width: ENEMY_WIDTH,
              height: ENEMY_HEIGHT,
              speed: ENEMY_BASE_SPEED,
            },
            {
              x: config.canvasWidth + 400,
              y: enemyGroundY,
              width: ENEMY_WIDTH,
              height: ENEMY_HEIGHT,
              speed: ENEMY_BASE_SPEED * 1.15,
            },
          ];

          setIsReady(true);
        } else {
          setTimeout(check, 100);
        }
      };

      check();
    };

    init();

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // メインループ
  const update = useCallback(
    (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !isReady) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      const playerX = 80;

      // スコア & スクロール
      if (!isGameOverRef.current) {
        scoreRef.current += dt * 10;
        setCurrentScore(Math.floor(scoreRef.current));
      }

      scrollRef.current.bgFar =
        (scrollRef.current.bgFar +
          config.initialSpeed * 0.2 * dt) %
        config.canvasWidth;
      scrollRef.current.bgMid =
        (scrollRef.current.bgMid +
          config.initialSpeed * 0.5 * dt) %
        config.canvasWidth;
      scrollRef.current.ground =
        (scrollRef.current.ground +
          config.initialSpeed * 1.0 * dt) %
        config.canvasWidth;

      // プレイヤー物理
      const p = playerRef.current;
      p.vy += config.gravity;
      p.y += p.vy;
      const groundY =
        config.canvasHeight -
        config.groundHeight -
        config.playerHeight;
      if (p.y > groundY) {
        p.y = groundY;
        p.vy = 0;
        p.jumpCount = 0;
      }

      // 敵移動
      enemiesRef.current.forEach((e) => {
        e.x -= e.speed * dt;
        if (e.x + e.width < 0) {
          e.x =
            config.canvasWidth + 200 + Math.random() * 300;
        }
      });

      // 当たり判定
      if (!isGameOverRef.current) {
        const playerHitBox = {
          x: playerX,
          y: p.y,
          w: PLAYER_WIDTH,
          h: config.playerHeight,
        };

        for (const e of enemiesRef.current) {
          const hit =
            playerHitBox.x <
              e.x + e.width &&
            playerHitBox.x + playerHitBox.w >
              e.x &&
            playerHitBox.y <
              e.y + e.height &&
            playerHitBox.y + playerHitBox.h >
              e.y;

          if (hit) {
            console.log("HIT!");
            isGameOverRef.current = true;
            cancelAnimationFrame(requestRef.current);
            onGameOver(Math.floor(scoreRef.current));
            return;
          }
        }
      }

      // 描画
      ctx.clearRect(
        0,
        0,
        config.canvasWidth,
        config.canvasHeight
      );

      const drawLoop = (
        img: HTMLImageElement | null,
        x: number,
        y: number,
        h: number
      ) => {
        if (!img) return;
        ctx.drawImage(
          img,
          -x,
          y,
          config.canvasWidth,
          h
        );
        ctx.drawImage(
          img,
          -x + config.canvasWidth,
          y,
          config.canvasWidth,
          h
        );
      };

      // 背景・地面
      drawLoop(
        assetsRef.current.bgFar,
        scrollRef.current.bgFar,
        0,
        config.canvasHeight
      );
      drawLoop(
        assetsRef.current.bgMid,
        scrollRef.current.bgMid,
        0,
        config.canvasHeight
      );
      drawLoop(
        assetsRef.current.ground,
        scrollRef.current.ground,
        config.canvasHeight - config.groundHeight,
        config.groundHeight
      );

      // プレイヤー（赤四角デバッグ）
      ctx.fillStyle = "red";
      ctx.fillRect(
        playerX,
        p.y,
        PLAYER_WIDTH,
        config.playerHeight
      );

      // 敵（青四角）
      ctx.fillStyle = "blue";
      enemiesRef.current.forEach((e) => {
        ctx.fillRect(
          e.x,
          e.y,
          e.width,
          e.height
        );
      });

      // Spine
      if (spineRef.current) {
        const { skeleton, state, renderer } =
          spineRef.current;
        state.update(dt);
        state.apply(skeleton);
        skeleton.updateWorldTransform();
        skeleton.x = playerX;
        skeleton.y = p.y + config.playerHeight;
        renderer.draw(skeleton);
      }

      requestRef.current = requestAnimationFrame(update);
    },
    [isReady, onGameOver]
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () =>
      cancelAnimationFrame(requestRef.current);
  }, [update]);

  const handleMouseDown = () => {
    if (isGameOverRef.current) return;

    if (playerRef.current.jumpCount < config.maxJumps) {
      playerRef.current.vy = config.jumpStrength;
      playerRef.current.jumpCount++;

      if (spineRef.current) {
        spineRef.current.state.setAnimation(
          0,
          "jump",
          false
        );
        spineRef.current.state.addAnimation(
          0,
          "run",
          true,
          0
        );
      }
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
            width: CANVAS_W,   // ここを固定値に
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
