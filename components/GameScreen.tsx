import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [score, setScore] = useState(0);

  const update = useCallback((time: number) => {
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

    // スコア加算（テスト用）
    setScore((prev) => prev + Math.floor(dt * 60));

    // ===== 描画テスト =====
    // 空
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 地面
    ctx.fillStyle = "#55aa55";
    ctx.fillRect(
      0,
      CANVAS_HEIGHT - 100,
      CANVAS_WIDTH,
      100
    );

    // プレイヤーの赤い四角
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(
      100,
      CANVAS_HEIGHT - 150,
      50,
      50
    );

    requestRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    console.log("=== NEW SIMPLE GameScreen mounted ===");
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
    }
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div
      className="w-screen h-screen flex items-center justify-center"
      style={{ background: "#003355" }} // 画面全体の色（濃い青緑）
    >
      <div
        className="relative"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          border: "4px solid yellow", // はっきりした黄色枠
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
