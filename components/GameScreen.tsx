import React, { useEffect, useRef, useState, useCallback } from "react";
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from "../config/game";

const config = gameConfigData;

enum PlayerState {
  RUNNING = "RUNNING",
  JUMPING = "JUMPING",
  CRASHED = "CRASHED",
}

const CANVAS_W = 800;
const CANVAS_H = 450;

export default function GameScreen({
  onGameOver,
}: {
  onGameOver: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);

  const lastTimeRef = useRef<number>(performance.now());
  const scoreRef = useRef(0);

  // 画像アセット
  const assets = useRef<{
    bgFar: HTMLImageElement | null;
    bgMid: HTMLImageElement | null;
    ground: HTMLImageElement | null;
  }>({ bgFar: null, bgMid: null, ground: null });

  // Spine
  const spineRef = useRef<{
    skeleton: any;
    state: any;
    renderer: any;
  } | null>(null);

  // プレイヤー位置
  const player = useRef({
    y: 350,
    vy: 0,
    jumpCount: 0,
  });

  // スクロール
  const scroll = useRef({ bgFar: 0, bgMid: 0, ground: 0 });

  // ==========================
  // 初期化
  // ==========================
  useEffect(() => {
    const init = async () => {
      const cvs = canvasRef.current;
      if (!cvs) return;

      cvs.width = CANVAS_W;
      cvs.height = CANVAS_H;

      const loadImg = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        });

      // 背景読み込み（相対パス）
      assets.current.bgFar = await loadImg("assets/images/bg_far.png");
      assets.current.bgMid = await loadImg("assets/images/bg_mid.png");
      assets.current.ground = await loadImg("assets/images/ground.png");

      // Spine 読み込み
      const assetManager = new (spine as any).AssetManager(
        "assets/spine/player/",
        new (spine as any).Downloader()
      );

      assetManager.loadText("char_v2.json");
      assetManager.loadTextureAtlas("char_v2.atlas");

      const wait = () => {
        if (assetManager.isLoadingComplete()) {
          try {
            const atlas = assetManager.get("char_v2.atlas");
            const json = assetManager.get("char_v2.json");

            const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
            const skeletonJson = new spine.SkeletonJson(atlasLoader);
            const skeletonData = skeletonJson.readSkeletonData(json);

            const skeleton = new spine.Skeleton(skeletonData);
            const state = new spine.AnimationState(
              new spine.AnimationStateData(skeletonData)
            );

            state.setAnimation(0, "run", true);

            const renderer = new spine.SkeletonRenderer(
              cvs.getContext("2d")!
            );

            // 初期座標
            skeleton.x = 180;
            skeleton.y = 350;
            skeleton.scaleX = skeleton.scaleY = 0.5;

            spineRef.current = { skeleton, state, renderer };
          } catch (err) {
            console.log("Spine init error:", err);
          }
          setIsReady(true);
        } else {
          setTimeout(wait, 100);
        }
      };

      wait();
    };

    init();
  }, []);

  // ==========================
  // update()
  // ==========================
  const update = useCallback(
    (time: number) => {
      const cvs = canvasRef.current;
      if (!cvs) return;

      const ctx = cvs.getContext("2d");
      if (!ctx) return;

      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (!isReady) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }

      // スコア更新
      scoreRef.current += dt * 10;
      setCurrentScore(Math.floor(scoreRef.current));

      // 背景スクロール
      scroll.current.bgFar = (scroll.current.bgFar + 30 * dt) % CANVAS_W;
      scroll.current.bgMid = (scroll.current.bgMid + 60 * dt) % CANVAS_W;
      scroll.current.ground = (scroll.current.ground + 120 * dt) % CANVAS_W;

      // プレイヤー物理
      player.current.vy += 900 * dt;
      player.current.y += player.current.vy;
      if (player.current.y > 350) {
        player.current.y = 350;
        player.current.vy = 0;
        player.current.jumpCount = 0;
      }

      // ==========================
      // 描画
      // ==========================
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // --- 背景 ---
      const drawLoop = (
        img: HTMLImageElement | null,
        scrollX: number,
        y: number,
        h: number
      ) => {
        if (!img) return;
        ctx.drawImage(img, -scrollX, y, CANVAS_W, h);
        ctx.drawImage(img, -scrollX + CANVAS_W, y, CANVAS_W, h);
      };

      drawLoop(assets.current.bgFar, scroll.current.bgFar, 0, CANVAS_H);
      drawLoop(assets.current.bgMid, scroll.current.bgMid, 0, CANVAS_H);
      drawLoop(
        assets.current.ground,
        scroll.current.ground,
        CANVAS_H - 100,
        100
      );

      // --- 赤いデバッグ四角 ---
      ctx.fillStyle = "red";
      ctx.fillRect(10, 10, 40, 40);

      // --- Spine プレイヤー ---
      if (spineRef.current) {
        const { skeleton, state, renderer } = spineRef.current;

        state.update(dt);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        skeleton.x = 180;
        skeleton.y = player.current.y + 100;

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

  // ==========================
  // ジャンプ
  // ==========================
  const jump = () => {
    if (player.current.jumpCount < 2) {
      player.current.vy = -450;
      player.current.jumpCount++;

      if (spineRef.current) {
        const { state } = spineRef.current;
        state.setAnimation(0, "jump", false);
        state.addAnimation(0, "run", true, 0);
      }
    }
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      onMouseDown={jump}
      onTouchStart={jump}
    >
      <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block"
          style={{ border: "1px solid red" }}
        />

        <div className="absolute top-2 right-2 bg-white/80 p-2 rounded text-orange-600 font-bold shadow">
          SCORE: {currentScore.toString().padStart(5, "0")}
        </div>
      </div>
    </div>
  );
}
