import React, { useEffect, useRef, useState, useCallback } from "react";
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from "../config/game";

const config: any = gameConfigData;

// キャンバスの論理サイズを固定（config が壊れていてもここで保証する）
const CANVAS_WIDTH = (config.canvasWidth as number) || 800;
const CANVAS_HEIGHT = (config.canvasHeight as number) || 450;

enum PlayerState {
  RUNNING = "RUNNING",
  JUMPING = "JUMPING",
  CRASHED = "CRASHED",
}

const GameScreen: React.FC<{ onGameOver: (score: number) => void }> = ({
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);

  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [currentScore, setCurrentScore] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const spineRef = useRef<any>(null);

  const assetsRef = useRef<{
    bgFar: HTMLImageElement | null;
    bgMid: HTMLImageElement | null;
    ground: HTMLImageElement | null;
  }>({ bgFar: null, bgMid: null, ground: null });

  const playerRef = useRef({
    y: CANVAS_HEIGHT - (config.groundHeight || 120) - (config.playerHeight || 150),
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const scrollRef = useRef({ bgFar: 0, bgMid: 0, ground: 0 });

  // ------------------ 初期化 ------------------
  useEffect(() => {
    console.log("GameScreen mounted");
    console.log("spine.VERSION:", (spine as any).VERSION);
    console.log("canvas logical size:", CANVAS_WIDTH, "x", CANVAS_HEIGHT);

    const init = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 論理サイズを固定
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      const base = (import.meta as any).env.BASE_URL || "/";
      const basePath = `${base}assets/`;

      const loadImg = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            console.log("loaded image:", src, img.width, "x", img.height);
            resolve(img);
          };
          img.onerror = (e) => {
            console.error("FAILED to load image:", src, e);
            resolve(null);
          };
        });

      assetsRef.current.bgFar = await loadImg(`${basePath}images/bg_far.png`);
      assetsRef.current.bgMid = await loadImg(`${basePath}images/bg_mid.png`);
      assetsRef.current.ground = await loadImg(`${basePath}images/ground.png`);

      // -------- Spine 読み込み --------
      const SpineNS: any = spine;

      const assetManager = new SpineNS.AssetManager(
        `${basePath}spine/player/`,
        new SpineNS.Downloader()
      );

      assetManager.loadText("char_v2.json");
      assetManager.loadTextureAtlas("char_v2.atlas");

      const check = () => {
        if (assetManager.isLoadingComplete()) {
          console.log(
            "Spine assets loaded:",
            assetManager.get("char_v2.atlas"),
            assetManager.get("char_v2.json")
          );
          try {
            const atlas = assetManager.get("char_v2.atlas");
            const json = assetManager.get("char_v2.json");

            const atlasLoader = new SpineNS.AtlasAttachmentLoader(atlas);
            const skeletonJson = new SpineNS.SkeletonJson(atlasLoader);
            const skeletonData = skeletonJson.readSkeletonData(json);

            const skeleton = new SpineNS.Skeleton(skeletonData);
            skeleton.setToSetupPose();
            skeleton.updateWorldTransform();

            const state = new SpineNS.AnimationState(
              new SpineNS.AnimationStateData(skeletonData)
            );
            state.setAnimation(0, "run", true);

            const ctx = canvas.getContext("2d")!;
            const renderer = new SpineNS.SkeletonRenderer(ctx);

            spineRef.current = { skeleton, state, renderer };
          } catch (e) {
            console.warn("Spine init error:", e);
          }
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

  // ------------------ 毎フレーム更新 ------------------
  const update = useCallback(
    (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      if (!isReady) {
        // ローディング中でも赤いテスト□だけ描く
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "red";
        ctx.fillRect(10, 10, 40, 40);
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      // --- スコア & スクロール ---
      scoreRef.current += dt * 10;
      setCurrentScore(Math.floor(scoreRef.current));

      const speed = config.initialSpeed || 3;
      scrollRef.current.bgFar =
        (scrollRef.current.bgFar + speed * 0.2) % CANVAS_WIDTH;
      scrollRef.current.bgMid =
        (scrollRef.current.bgMid + speed * 0.5) % CANVAS_WIDTH;
      scrollRef.current.ground =
        (scrollRef.current.ground + speed) % CANVAS_WIDTH;

      // --- プレイヤーの重力 ---
      const p = playerRef.current;
      const gravity = config.gravity ?? 0.8;
      const playerH = config.playerHeight || 150;
      const groundH = config.groundHeight || 120;

      p.vy += gravity;
      p.y += p.vy;

      const groundY = CANVAS_HEIGHT - groundH - playerH;
      if (p.y > groundY) {
        p.y = groundY;
        p.vy = 0;
        p.jumpCount = 0;
      }

      // --- 描画 ---
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const drawLoop = (
        img: HTMLImageElement | null,
        x: number,
        y: number,
        h: number
      ) => {
        if (!img) return;
        ctx.drawImage(img, -x, y, CANVAS_WIDTH, h);
        ctx.drawImage(img, -x + CANVAS_WIDTH, y, CANVAS_WIDTH, h);
      };

      // 背景
      drawLoop(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, CANVAS_HEIGHT);
      drawLoop(assetsRef.current.bgMid, scrollRef.current.bgMid, 0, CANVAS_HEIGHT);
      drawLoop(
        assetsRef.current.ground,
        scrollRef.current.ground,
        CANVAS_HEIGHT - groundH,
        groundH
      );

      // テスト用の赤い四角（左上）
      ctx.fillStyle = "red";
      ctx.fillRect(10, 10, 40, 40);

      // プレイヤー Spine
      if (spineRef.current) {
        const { skeleton, state, renderer } = spineRef.current;

        state.update(dt);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        skeleton.x = 120; // 左から少し内側
        skeleton.y = p.y + playerH; // 足が地面に乗るように

        renderer.draw(skeleton);
      }

      requestRef.current = requestAnimationFrame(update);
    },
    [isReady]
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  // ------------------ クリックでジャンプ ------------------
  const handleJump = () => {
    const p = playerRef.current;
    const maxJumps = config.maxJumps || 2;
    const jumpStrength = config.jumpStrength || -18;

    if (p.jumpCount < maxJumps) {
      p.vy = jumpStrength;
      p.jumpCount++;

      if (spineRef.current) {
        spineRef.current.state.setAnimation(0, "jump", false);
        spineRef.current.state.addAnimation(0, "run", true, 0);
      }
    }
  };

  return (
    <div
      className="w-screen h-screen flex items-center justify-center bg-slate-100"
      onMouseDown={handleJump}
      onTouchStart={handleJump}
    >
      {/* ここが 800x450 の固定ゲーム画面 */}
      <div
        style={{
          position: "relative",
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          border: "4px solid red",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
        <div className="absolute top-3 right-3 bg-white/80 px-3 py-1 rounded-lg font-bold text-orange-600 text-sm">
          SCORE: {currentScore.toString().padStart(5, "0")}
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
