import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from '../config/game';
import assetConfig from '../config/assets';
import { GameConfig, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

// PlayerStateを内部で定義
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
    img.onerror = () => resolve(null);
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
    bgFar: 0,
    bgMid: 0,
    ground: 0,
    speed: config.initialSpeed,
  });

  const obstaclesRef = useRef<Obstacle[]>([]);

  // 読み込み部分を「waitForAssets」を使わない方式に修正
  const loadSpineAssets = (canvas: HTMLCanvasElement) => {
    const baseUrl = "assets/spine/player/";
    const assetManager = new spine.AssetManager(baseUrl);

    assetManager.loadText("character.json");
    assetManager.loadTextureAtlas("character.atlas");

    // 読み込み完了を監視するループ
    const checkAssets = () => {
      if (assetManager.isLoadingComplete()) {
        const atlas = assetManager.get("character.atlas");
        const json = assetManager.get("character.json");

        if (atlas && json) {
          const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
          const skeletonJson = new spine.SkeletonJson(atlasLoader);
          const skeletonData = skeletonJson.readSkeletonData(json);
          const skeleton = new spine.Skeleton(skeletonData);
          const stateData = new spine.AnimationStateData(skeletonData);
          const state = new spine.AnimationState(stateData);
          const renderer = new spine.SkeletonRenderer(canvas.getContext("2d")!);

          skeleton.setScale(0.25, 0.25); 
          state.setAnimation(0, "run", true);
          spineRef.current = { skeleton, state, renderer };
        }
      } else {
        setTimeout(checkAssets, 100);
      }
    };
    checkAssets();
  };

  const setupCanvas = (canvas: HTMLCanvasElement) => {
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;
  };

  const initGame = useCallback(async () => {
    if (!canvasRef.current) return;
    setupCanvas(canvasRef.current);

    // Spineの読み込み開始（待機せずに次へ進む）
    loadSpineAssets(canvasRef.current);

    // 画像アセットの読み込み
    const [bgFar, bgMid, ground, oGS, oGL, oFS, oFL] = await Promise.all([
      loadImage(assetConfig.images.backgroundFar),
      loadImage(assetConfig.images.backgroundMid),
      loadImage(assetConfig.images.ground),
      loadImage(assetConfig.images.obsGroundSmall),
      loadImage(assetConfig.images.obsGroundLarge),
      loadImage(assetConfig.images.obsFlySmall),
      loadImage(assetConfig.images.obsFlyLarge),
    ]);

    assetsRef.current = {
      bgFar, bgMid, ground,
      obsGroundSmall: oGS, obsGroundLarge: oGL,
      obsFlySmall: oFS, obsFlyLarge: oFL,
    };
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const spawnObstacle = useCallback(() => {
    const types: ObstacleType[] = ['GROUND_SMALL', 'GROUND_LARGE', 'FLY_SMALL', 'FLY_LARGE'];
    const type = types[Math.floor(Math.random() * types.length)];
    let y = config.canvasHeight - config.groundHeight - 50;
    if (type === 'FLY_SMALL' || type === 'FLY_LARGE') y -= 80 + Math.random() * 100;

    obstaclesRef.current.push({
      id: Math.random(),
      x: config.canvasWidth,
      y,
      width: type.includes('LARGE') ? 80 : 50,
      height: type.includes('LARGE') ? 80 : 50,
      type,
    });
  }, []);

  const update = useCallback((time: number) => {
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

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

      if (Math.random() < 0.015) spawnObstacle();

      obstaclesRef.current = obstaclesRef.current.filter(obs => {
        obs.x -= scrollRef.current.speed;
        const hitX = player.y < obs.y + obs.height && player.y + config.playerHeight > obs.y;
        const hitY = 50 < obs.x + obs.width && 50 + config.playerWidth > obs.x;
        if (hitX && hitY) {
          player.state = PlayerState.CRASHED;
          try { spineRef.current?.state.setAnimation(0, "die", false); } catch(e) {}
          onGameOver(Math.floor(scoreRef.current));
          return false;
        }
        return obs.x > -100;
      });
    }

    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

    const drawParallax = (img: HTMLImageElement | null, x: number, y: number, h: number) => {
      if (!img) return;
      ctx.drawImage(img, -x, y, config.canvasWidth, h);
      ctx.drawImage(img, -x + config.canvasWidth, y, config.canvasWidth, h);
    };

    drawParallax(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, config.canvasHeight);
    drawParallax(assetsRef.current.bgMid, scrollRef.current.bgMid, 0, config.canvasHeight);
    drawParallax(assetsRef.current.ground, scrollRef.current.ground, config.canvasHeight - config.groundHeight, config.groundHeight);

    obstaclesRef.current.forEach(obs => {
      let img = assetsRef.current.obsGroundSmall;
      if (obs.type === 'GROUND_LARGE') img = assetsRef.current.obsGroundLarge;
      if (obs.type === 'FLY_SMALL') img = assetsRef.current.obsFlySmall;
      if (obs.type === 'FLY_LARGE') img = assetsRef.current.obsFlyLarge;
      if (img) ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
    });

    if (spineRef.current) {
      const { skeleton, state, renderer } = spineRef.current;
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      skeleton.x = 50 + config.playerWidth / 2;
      skeleton.y = playerRef.current.y + config.playerHeight;
      renderer.draw(skeleton);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [onGameOver, spawnObstacle]);

  const startJump = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const player = playerRef.current;
    if (player.state !== PlayerState.CRASHED && player.jumpCount < config.maxJumps) {
      player.vy = config.jumpStrength;
      player.jumpCount++;
      player.state = PlayerState.JUMPING;
      try {
        spineRef.current?.state.setAnimation(0, "jump", false);
        spineRef.current?.state.addAnimation(0, "run", true, 0);
      } catch(e) {}
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  return (
    <div className="relative w-full h-full bg-slate-200 overflow-hidden select-none" onMouseDown={startJump} onTouchStart={startJump}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm border border-orange-100 pointer-events-none z-10">
        SCORE: {currentScore.toString().padStart(5, '0')}
      </div>
    </div>
  );
};

export default GameScreen;
