import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

import gameConfigData from "../config/game";

const config = gameConfigData;

// Vite の base 設定に追従してパスを作る
const IMAGE_BASE = import.meta.env.BASE_URL + "assets/images/";

const CANVAS_WIDTH = config.canvasWidth ?? 960;
const CANVAS_HEIGHT = config.canvasHeight ?? 540;

const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  const [score, setScore] = useState(0);

  // 画像とスクロール量
  const assetsRef = useRef<{
    bgFar: HTMLImageElement | null;
    bgMid: HTMLImageElement | null;
    ground: HTMLImageElement | null;
  }>({ bgFar: null, bgMid: null, ground: null });

  const scrollRef = useRef({
    bgFar: 0,
    bgMid: 0,
    ground: 0,
  });

  const [isReady, setIsReady] = useState(false);

  // 画像ロード
  useEffect(() => {
    console.log("=== GameScreen mounted ===");
    console.log("BASE_URL:", import.meta.env.BASE_URL);

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

    (async () => {
      const [bgFar, bgMid, ground] = await Promise.all([
        loadImg(IMAGE_BASE + "bg_far.png"),
        loadImg(IMAGE_BASE + "bg_mid.png"),
        loadImg(IMAGE_BASE + "ground.png"),
      ]);

      assetsRef.current = { bgFar, bgMid, ground };

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
      }

      setIsReady(true);
    })();
  }, []);

  // 描画ループ
  const update = useCallback(
    (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

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

      if (isReady) {
        // スコア
        setScore((prev) => prev + Math.floor(dt * 60));

        // スクロール値更新
        scrollRef.current.bgFar =
          (scrollRef.current.bgFar + (config.initialSpeed ?? 4) * 0.2) %
          CANVAS_WIDTH;
        scrollRef.current.bgMid =
          (scrollRef.current.bgMid + (config.initialSpeed ?? 4) * 0.5) %
          CANVAS_WIDTH;
        scrollRef.current.ground =
          (scrollRef.current.ground + (config.initialSpeed ?? 4)) %
          CANVAS_WIDTH;
      }

      // ===== 描画 =====

      // 空の色（背景の抜けが分からない場合でも見えるように）
      ctx.fillStyle = "#87CEEB";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 背景画像をループ描画
      const drawLoop = (
        img: HTMLImageElement | null,
        scrollX: number,
        y: number,
        h: number
      ) => {
        if (!img) return;
        ctx.drawImage(img, -scrollX, y, CANVAS_WIDTH, h);
        ctx.drawImage(img, -scrollX + CANVAS_WIDTH, y, CANVAS_WIDTH, h);
      };

      const groundHeight = config.groundHeight ?? 120;

      drawLoop(
        assetsRef.current.bgFar,
        scrollRef.current.bgFar,
        0,
        CANVAS_HEIGHT
      );
      drawLoop(
        assetsRef.current.bgMid,
        scrollRef.current.bgMid,
        0,
        CANVAS_HEIGHT
      );
      drawLoop(
        assetsRef.current.ground,
        scrollRef.current.ground,
        CANVAS_HEIGHT - groundHeight,
        groundHeight
      );

      // プレイヤーの赤い四角（Spine の代わり）
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(
        100,
        CANVAS_HEIGHT - groundHeight - 50,
        50,
        50
      );

      requestRef.current = requestAnimationFrame(update);
    },
    [isReady]
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div
      className="w-screen h-screen flex items-center justify-center"
      style={{ background: "#003355" }}
    >
      <div
        className="relative"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          border: "4px solid yellow",
          background: "#222222",
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

        <div
          className="absolute top-4 right-4"
          style={{
            background: "rgba(255,255,255,0.8)",
            padding: "4px 8px",
            borderRadius: 8,
            fontWeight: "bold",
            color: "orange",
          }}
        >
          SCORE: {score.toString().padStart(5, "0")}
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
