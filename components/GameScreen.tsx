import React, { useEffect, useRef, useState, useCallback } from "react";
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from "../config/game";

const config = gameConfigData;
// Vite のベースパス（/ または /Wedding-Run/ 想定）
const base = import.meta.env.BASE_URL ?? "/";

enum PlayerState {
RUNNING = "RUNNING",
JUMPING = "JUMPING",
CRASHED = "CRASHED",
}

const GameScreen: React.FC<{ onGameOver: (score: number) => void }> = ({
onGameOver,
}) => {
const canvasRef = useRef<HTMLCanvasElement>(null);
const requestRef = useRef<number>(0);
const scoreRef = useRef<number>(0);
const lastTimeRef = useRef<number>(performance.now());

const [currentScore, setCurrentScore] = useState(0);
const [isReady, setIsReady] = useState(false);

const spineRef = useRef<{
 skeleton: any;
 state: any;
 renderer: any;
} | null>(null);

const assetsRef = useRef<{
 bgFar: HTMLImageElement | null;
 bgMid: HTMLImageElement | null;
 ground: HTMLImageElement | null;
}>({
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

// ---------------- 初期化 ----------------
useEffect(() => {
 console.log("GameScreen mounted");
 console.log("spine.AssetManager:", (spine as any).AssetManager);

 const init = async () => {
   if (!canvasRef.current) return;

   const canvas = canvasRef.current;
   canvas.width = config.canvasWidth;
   canvas.height = config.canvasHeight;

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

   // 背景画像ロード（base を使ってどこからでも動くように）
   assetsRef.current.bgFar = await loadImg(
     `${base}assets/images/bg_far.png`
   );
   assetsRef.current.bgMid = await loadImg(
     `${base}assets/images/bg_mid.png`
   );
   assetsRef.current.ground = await loadImg(
     `${base}assets/images/ground.png`
   );

   // Spine アセットロード
   const assetManager = new (spine as any).AssetManager(
     `${base}assets/spine/player/`,
     new (spine as any).Downloader()
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

         if (!atlas || !json) {
           console.error("Spine assets missing");
           setIsReady(true);
           return;
         }

         const atlasLoader = new (spine as any).AtlasAttachmentLoader(
           atlas
         );
         const skeletonJson = new (spine as any).SkeletonJson(atlasLoader);
         const skeletonData = skeletonJson.readSkeletonData(json);

         const skeleton = new (spine as any).Skeleton(skeletonData);
         const state = new (spine as any).AnimationState(
           new (spine as any).AnimationStateData(skeletonData)
         );
         state.setAnimation(0, "run", true);

         const ctx = canvas.getContext("2d");
         if (!ctx) {
           console.error("Canvas 2D context not available");
           setIsReady(true);
           return;
         }

         const renderer = new (spine as any).SkeletonRenderer(ctx);

         spineRef.current = {
           skeleton,
           state,
           renderer,
         };
       } catch (e) {
         console.warn("Spine の初期化エラー:", e);
       }
       setIsReady(true);
     } else {
       setTimeout(check, 100);
     }
   };

   check();
 };

 init();
}, []);

// ---------------- 更新 & 描画ループ ----------------
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

   // --- スコア & スクロール計算 ---
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

   // --- プレイヤーの物理計算 ---
   const p = playerRef.current;
   p.vy += config.gravity;
   p.y += p.vy;
   const gY =
     config.canvasHeight - config.groundHeight - config.playerHeight;
   if (p.y > gY) {
     p.y = gY;
     p.vy = 0;
     p.jumpCount = 0;
   }

   // --- 描画 ---
   ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

   const drawLoop = (
     img: HTMLImageElement | null,
     x: number,
     y: number,
     h: number
   ) => {
     if (!img) return;
     ctx.drawImage(img, -x, y, config.canvasWidth, h);
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

   // ★テスト用：赤い四角（デバッグ用に残してOK）
   ctx.fillStyle = "red";
   ctx.fillRect(10, 10, 80, 80);

   // プレイヤー（Spine）
   if (spineRef.current) {
     const { skeleton, state, renderer } = spineRef.current;
     state.update(dt);
     state.apply(skeleton);
     skeleton.updateWorldTransform();
     skeleton.x = 80;
     skeleton.y = p.y + config.playerHeight;
     renderer.draw(skeleton);
   }

   // 次フレームを予約
   requestRef.current = requestAnimationFrame(update);
 },
 [isReady]
);

useEffect(() => {
 requestRef.current = requestAnimationFrame(update);
 return () => cancelAnimationFrame(requestRef.current);
}, [update]);

// ---------------- 入力・描画 ----------------
return (
  <div
    className="w-full h-full flex items-center justify-center"
  >
    {/* キャンバス用の枠を、物理サイズと同じに固定 */}
    <div
      className="relative"
      style={{ width: config.canvasWidth, height: config.canvasHeight }}
    >
      <canvas
        ref={canvasRef}
        // 描画バッファのサイズも明示しておく
        width={config.canvasWidth}
        height={config.canvasHeight}
        className="block bg-white"
      />

      {/* スコア表示 */}
      <div className="absolute top-4 right-4 bg-white/80 p-2 rounded-lg font-bold text-orange-600 shadow">
        SCORE: {currentScore.toString().padStart(5, '0')}
      </div>
    </div>
  </div>
);

export default GameScreen;
