import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  MouseEvent,
} from "react";
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from "../config/game";

const config = gameConfigData;

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

  const assetsRef = useRef<{
    bgFar: HTMLImageElement | null;
    bgMid: HTMLImageElement | null;
    ground: HTMLImageElement | null;
  }>({
    bgFar: null,
    bgMid: null,
    ground: null,
  });

  const spineRef = useRef<{
    skeleton: any;
    state: any;
    renderer: any;
  } | null>(null);

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

  // --------------------------------
  // 初期化
  // --------------------------------
  useEffect(() => {
    console.log("GameScreen mounted");
    console.log("spine.VERSION:", (spine as any).VERSION);
    console.log("spine.AssetManager:", (spine as any).AssetManager);

    const init = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 内部バッファサイズ
      canvas.width = config.canvasWidth;
      canvas.height = config.canvasHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ベースパス（/Wedding-Run/ 対応）
      const base =
        (import.meta as any).env.BASE_URL ??
        (window.location.pathname.includes("/Wedding-Run/")
          ? "/Wedding-Run/"
          : "/");

      const imgBase = `${base}assets/images/`;
      const spineBase = `${base}assets/spine/player/`;

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

      // 背景画像
      assetsRef.current.bgFar = await loadImg(`${imgBase}bg_far.png`);
      assetsRef.current.bgMid = await loadImg(`${imgBase}bg_mid.png`);
      assetsRef.current.ground = await loadImg(`${imgBase}ground.png`);

      // Spine アセット
      const AssetManager = (spine as any).AssetManager;
      const Downloader = (spine as any).Downloader;

      const assetManager = new AssetManager(spineBase, new Downloader());
      assetManager.loadText("char_v2.json");
      assetManager.loadTextureAtlas("char_v2.atlas");

      const check = () => {
        if (!canvasRef.current) return;

        if (assetManager.isLoadingComplete()) {
          try {
            const atlas = assetManager.get("char_v2.atlas");
            const json = assetManager.get("char_v2.json");
            console.log("Spine assets loaded:", atlas, json);

            const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
            const skeletonJson = new spine.SkeletonJson(atlasLoader);
            const skeletonData = skeletonJson.readSkeletonData(json);

            const skeleton = new spine.Skeleton(skeletonData);
            // 見えるように縮小
            skeleton.scaleX = 0.4;
            skeleton.scaleY = 0.4;
            skeleton.x = config.canvasWidth * 0.25;
            skeleton.y = config.canvasHeight - config.groundHeight;

            const state = new spine.AnimationState(
              new spine.AnimationStateData(skeletonData)
            );
            state.setAnimation(0, "run", true);

            const renderer = new (spine as any).SkeletonRenderer(
              canvas.getContext("2d")!
            );
            renderer.premultipliedAlpha = true;

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
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  // --------------------------------
  // メインループ
  // --------------------------------
  const update = useCallback(
    (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !isReady) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      // スコアとスクロール
      scoreRef.current += dt * 10;
      setCurrentScore(Math.floor(scoreRef.current));

      scrollRef.current.bgFar =
        (scrollRef.current.bgFar + config.initialSpeed * 0.2) %
        config.canvasWidth;
      scrollRef.current.bgMid =
        (scrollRef.current.bgMid + config.initialSpeed * 0.5) %
        config.canvasWidth;
      scrollRef.current.ground =
        (scrollRef.current.ground + config.initialSpeed) %
        config.canvasWidth;

      // プレイヤー物理
      const p = playerRef.current;
      p.vy += config.gravity;
      p.y += p.vy;
      const groundY =
        config.canvasHeight - config.groundHeight - config.playerHeight;
      if (p.y > groundY) {
        p.y = groundY;
        p.vy = 0;
        p.jumpCount = 0;
      }

      // 画面クリア
      ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

      const drawLoop = (
        img: HTMLImageElement | null,
        x: number,
        y: number,
        h: number
      ) => {
        if (!img) return;
        ctx.drawImage(img, -x, y, config.canvasWidth, h);
        ctx.drawImage(img, -x + config.canvasWidth, y, config.canvasWidth, h);
      };

      // 背景・地面
      drawLoop(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, canvas.height);
      drawLoop(
        assetsRef.current.bgMid,
        scrollRef.current.bgMid,
        0,
        canvas.height
      );
      drawLoop(
        assetsRef.current.ground,
        scrollRef.current.ground,
        canvas.height - config.groundHeight,
        config.groundHeight
      );

      // ★デバッグ用：赤い四角
      ctx.fillStyle = "red";
      ctx.fillRect(10, 10, 80, 80);

      // プレイヤー（Spine）
      if (spineRef.current) {
        const { skeleton, state, renderer } = spineRef.current;
        state.update(dt);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        const pY = p.y + config.playerHeight;
        const clampedY = Math.max(
          config.groundHeight,
          Math.min(canvas.height, pY)
        );

        skeleton.x = canvas.width * 0.25;
        skeleton.y = clampedY;

        renderer.ctx = ctx;
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

  // --------------------------------
  // 入力（クリックでジャンプ）
  // --------------------------------
  const handleMouseDown = (_e: MouseEvent<HTMLDivElement>) => {
    const p = playerRef.current;
    if (p.jumpCount >= config.maxJumps) return;

    p.vy = config.jumpStrength;
    p.jumpCount++;

    if (spineRef.current) {
      const { state } = spineRef.current;
      state.setAnimation(0, "jump", false);
      state.addAnimation(0, "run", true, 0);
    }
  };

  // --------------------------------
  // 描画
  // --------------------------------
  return (
    <div className="w-full h-full relative" onMouseDown={handleMouseDown}>
      <canvas
        ref={canvasRef}
        style={{
          width: `${config.canvasWidth}px`,
          height: `${config.canvasHeight}px`,
          border: "1px solid red",
          display: "block",
        }}
      />
      <div className="absolute top-4 right-4 bg-white/80 p-2 rounded-lg font-bold text-orange-600 shadow">
        SCORE: {currentScore.toString().padStart(5, "0")}
      </div>
    </div>
  );
};

export default GameScreen;
