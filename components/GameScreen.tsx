import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from '../config/game';
import { GameConfig, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

enum PlayerState {
  RUNNING = 'RUNNING',
  JUMPING = 'JUMPING',
  CRASHED = 'CRASHED'
}

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [currentScore, setCurrentScore] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const spineRef = useRef<{
    skeleton: spine.Skeleton;
    state: spine.AnimationState;
    renderer: spine.SkeletonRenderer;
  } | null>(null);

  const assetsRef = useRef({
    bgFar: null as HTMLImageElement | null,
    bgMid: null as HTMLImageElement | null,
    ground: null as HTMLImageElement | null,
  });

  const playerRef = useRef({
    y: config.canvasHeight - config.groundHeight - config.playerHeight,
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const scrollRef = useRef({ bgFar: 0, bgMid: 0, ground: 0, speed: config.initialSpeed });

  // 画像を1つずつ安全に読み込む関数
  const loadImage = (path: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = path;
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn("画像が見つかりません:", path);
        resolve(null);
      };
    });
  };

  const loadSpineAssets = (canvas: HTMLCanvasElement) => {
    const assetManager = new spine.AssetManager("assets/spine/player/");
    assetManager.loadText("character.json");
    assetManager.loadTextureAtlas("character.atlas");

    const check = () => {
      if (assetManager.isLoadingComplete()) {
        const atlas = assetManager.get("character.atlas");
        const json = assetManager.get("character.json");
        if (atlas && json) {
          try {
            const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
            const skeletonJson = new spine.SkeletonJson(atlasLoader);
            
            // 物理エラー(physics is undefined)を回避する魔法の一行
            (skeletonJson as any).preserveVariableNames = true;
            
            const skeletonData = skeletonJson.readSkeletonData(json);
            const skeleton = new spine.Skeleton(skeletonData);
            skeleton.scaleX = 0.25;
            skeleton.scaleY = 0.25;
            
            const stateData = new spine.AnimationStateData(skeletonData);
            const state = new spine.AnimationState(stateData);
            const renderer = new spine.SkeletonRenderer(canvas.getContext("2d")!);

            state.setAnimation(0, "run", true);
            spineRef.current = { skeleton, state, renderer };
            setIsReady(true);
          } catch (e) {
            console.error("Spineの初期化に失敗:", e);
          }
        }
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };

  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = config.canvasWidth;
      canvasRef.current.height = config.canvasHeight;

      loadSpineAssets(canvasRef.current);

      // 直接パスを指定して画像を読み込む（設定ファイルのエラーを回避）
      assetsRef.current.bgFar = await loadImage("assets/images/bg_far.png");
      assetsRef.current.bgMid = await loadImage("assets/images/bg_mid.png");
      assetsRef.current.ground = await loadImage("assets/images/ground.png");
    };
    init();
  }, []);

  const update = useCallback((time: number) => {
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // 更新処理
    if (playerRef.current.state !== PlayerState.CRASHED) {
      scoreRef.current += dt * 10;
      setCurrentScore(Math.floor(scoreRef.current));
      scrollRef.current.bgFar = (scrollRef.current.bgFar + config.initialSpeed * 0.2) % config.canvasWidth;
      scrollRef.current.bgMid = (scrollRef.current.bgMid + config.initialSpeed * 0.5) % config.canvasWidth;
      scrollRef.current.ground = (scrollRef.current.ground + config.initialSpeed) % config.canvasWidth;

      const p = playerRef.current;
      p.vy += config.gravity;
      p.y += p.vy;
      const groundLimit = config.canvasHeight - config.groundHeight - config.playerHeight;
      if (p.y > groundLimit) {
        p.y = groundLimit;
        p.vy = 0;
        if (p.state !== PlayerState.RUNNING) {
          p.state = PlayerState.RUNNING;
          spineRef.current?.state.setAnimation(0, "run", true);
        }
        p.jumpCount = 0;
      }
    }

    // 描画処理
    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);
    
    const draw = (img: HTMLImageElement | null, x: number, y: number, h: number) => {
      if (img) {
        ctx.drawImage(img, -x, y, config.canvasWidth, h);
        ctx.drawImage(img, -x + config.canvasWidth, y, config.canvasWidth, h);
      }
    };

    draw(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, config.canvasHeight);
    draw(assetsRef.current.bgMid, scrollRef.current.bgMid, 0, config.canvasHeight);
    draw(assetsRef.current.ground, scrollRef.current.ground, config.canvasHeight - config.groundHeight, config.groundHeight);

    if (spineRef.current && isReady) {
      const { skeleton, state, renderer } = spineRef.current;
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      skeleton.x = 80;
      skeleton.y = playerRef.current.y + config.playerHeight;
      renderer.draw(skeleton);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [isReady]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div className="w-full h-full relative bg-blue-100" onMouseDown={() => {
      const p = playerRef.current;
      if (p.jumpCount < config.maxJumps) {
        p.vy = config.jumpStrength;
        p.jumpCount++;
        p.state = PlayerState.JUMPING;
        spineRef.current?.state.setAnimation(0, "jump", false);
        spineRef.current?.state.addAnimation(0, "run", true, 0);
      }
    }}>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-4 right-4 bg-white/80 p-2 rounded-lg font-bold text-orange-600">
        SCORE: {currentScore.toString().padStart(5, '0')}
      </div>
    </div>
  );
};

export default GameScreen;
