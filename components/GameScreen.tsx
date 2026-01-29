import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from '../config/game';
import assetConfig from '../config/assets';
import { GameConfig, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

// エラー回避のため内部で定義
enum PlayerState {
  RUNNING = 'RUNNING',
  JUMPING = 'JUMPING',
  CRASHED = 'CRASHED'
}

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error("Failed to load:", src);
      resolve(null);
    };
  });
};

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [currentScore, setCurrentScore] = useState(0);
  
  const spineRef = useRef<{
    skeleton: spine.Skeleton;
    state: spine.AnimationState;
    renderer: spine.SkeletonRenderer;
  } | null>(null);

  const assetsRef = useRef({
    bgFar: null as HTMLImageElement | null,
    bgMid: null as HTMLImageElement | null,
    ground: null as HTMLImageElement | null,
    obsGroundSmall: null as HTMLImageElement | null,
    obsGroundLarge: null as HTMLImageElement | null,
    obsFlySmall: null as HTMLImageElement | null,
    obsFlyLarge: null as HTMLImageElement | null,
  });

  const playerRef = useRef({
    y: config.canvasHeight - config.groundHeight - config.playerHeight,
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const scrollRef = useRef({
    bgFar: 0, bgMid: 0, ground: 0,
    speed: config.initialSpeed,
  });

  const obstaclesRef = useRef<Obstacle[]>([]);

  // Spine読み込み (エラー回避版)
  const loadSpineAssets = (canvas: HTMLCanvasElement) => {
    const baseUrl = "assets/spine/player/";
    const assetManager = new spine.AssetManager(baseUrl);

    assetManager.loadText("character.json");
    assetManager.loadTextureAtlas("character.atlas");

    const checkLoading = () => {
      if (assetManager.isLoadingComplete()) {
        const atlas = assetManager.get("character.atlas");
        const json = assetManager.get("character.json");
        if (atlas && json) {
          const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
          const skeletonJson = new spine.SkeletonJson(atlasLoader);
          const skeletonData = skeletonJson.readSkeletonData(json);
          const skeleton = new spine.Skeleton(skeletonData);
          
          // setScale の代わりに直接 scale を代入
          skeleton.scaleX = 0.25;
          skeleton.scaleY = 0.25;

          const stateData = new spine.AnimationStateData(skeletonData);
          const state = new spine.AnimationState(stateData);
          const renderer = new spine.SkeletonRenderer(canvas.getContext("2d")!);

          state.setAnimation(0, "run", true);
          spineRef.current = { skeleton, state, renderer };
        }
      } else {
        setTimeout(checkLoading, 100);
      }
    };
    checkLoading();
  };

  const initGame = useCallback(async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;

    loadSpineAssets(canvas);

    const [bgFar, bgMid, ground, oGS, oGL, oFS, oFL] = await Promise.all([
      loadImage(assetConfig.images.backgroundFar),
      loadImage(assetConfig.images.backgroundMid),
      loadImage(assetConfig.images.ground),
      loadImage(assetConfig.images.obsGroundSmall),
      loadImage(assetConfig.images.obsGroundLarge),
      loadImage(assetConfig.images.obsFlySmall),
      loadImage(assetConfig.images.obsFlyLarge),
    ]);

    assetsRef.current = { bgFar, bgMid, ground, obsGroundSmall: oGS, obsGroundLarge: oGL, obsFlySmall: oFS, obsFlyLarge: oFL };
  }, []);

  useEffect(() => { initGame(); }, [initGame]);

  const update = useCallback((time: number) => {
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    if (playerRef.current.state !== PlayerState.CRASHED) {
      scoreRef.current += dt * 10;
      setCurrentScore(Math.floor(scoreRef.current));
      scrollRef.current.speed = config.initialSpeed + (scoreRef.current / 100);
      scrollRef.current.bgFar = (scrollRef.current.bgFar + scrollRef.current.speed * 0.2) % config.canvasWidth;
      scrollRef.current.bgMid = (scrollRef.current.bgMid + scrollRef.current.speed * 0.5) % config.canvasWidth;
      scrollRef.current.ground = (scrollRef.current.ground + scrollRef.current.speed) % config.canvasWidth;

      const player = playerRef.current;
      player.vy += config.gravity;
      player.y += player.vy;
      const groundY = config.canvasHeight - config.groundHeight - config.playerHeight;
      if (player.y > groundY) {
        player.y = groundY;
        player.vy = 0;
        if (player.state !== PlayerState.RUNNING) {
          player.state = PlayerState.RUNNING;
          spineRef.current?.state.setAnimation(0, "run", true);
        }
        player.jumpCount = 0;
      }
    }

    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);
    
    // 背景描画
    const drawParallax = (img: HTMLImageElement | null, x: number, y: number, h: number) => {
      if (!img) return;
      ctx.drawImage(img, -x, y, config.canvasWidth, h);
      ctx.drawImage(img, -x + config.canvasWidth, y, config.canvasWidth, h);
    };

    drawParallax(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, config.canvasHeight);
    drawParallax(assetsRef.current.bgMid, scrollRef.current.bgMid, 0, config.canvasHeight);
    drawParallax(assetsRef.current.ground, scrollRef.current.ground, config.canvasHeight - config.groundHeight, config.groundHeight);

    // キャラ描画
    if (spineRef.current) {
      const { skeleton, state, renderer } = spineRef.current;
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      skeleton.x = 80;
      skeleton.y = playerRef.current.y + config.playerHeight;
      renderer.draw(skeleton);
    }

    requestRef.current = requestAnimationFrame(update);
  }, []);

  const jump = () => {
    if (playerRef.current.jumpCount < config.maxJumps) {
      playerRef.current.vy = config.jumpStrength;
      playerRef.current.jumpCount++;
      playerRef.current.state = PlayerState.JUMPING;
      spineRef.current?.state.setAnimation(0, "jump", false);
      spineRef.current?.state.addAnimation(0, "run", true, 0);
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div className="w-full h-full relative bg-blue-100" onMouseDown={jump}>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-4 right-4 bg-white/80 p-2 rounded-lg font-bold text-orange-600">
        SCORE: {currentScore.toString().padStart(5, '0')}
      </div>
    </div>
  );
};

export default GameScreen;
