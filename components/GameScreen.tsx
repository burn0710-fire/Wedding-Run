import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as spine from "@esotericsoftware/spine-canvas";
console.log("Spine VERSION:", (spine as any).VERSION);
console.log("AssetManager:", (spine as any).AssetManager);
console.log("Downloader:", (spine as any).Downloader);

import gameConfigData from '../config/game';
const config = gameConfigData;

enum PlayerState {
  RUNNING = 'RUNNING',
  JUMPING = 'JUMPING',
  CRASHED = 'CRASHED'
}


const GameScreen: React.FC<{ onGameOver: (score: number) => void }> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const [currentScore, setCurrentScore] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const spineRef = useRef<any>(null);
  const assetsRef = useRef<any>({ bgFar: null, bgMid: null, ground: null });
  const playerRef = useRef({
    y: config.canvasHeight - config.groundHeight - config.playerHeight,
    vy: 0,
    state: PlayerState.RUNNING,
    jumpCount: 0,
  });

  const scrollRef = useRef({ bgFar: 0, bgMid: 0, ground: 0 });

  useEffect(() => {
    console.log('GameScreen mounted');
    console.log('spine version:', (spine as any).VERSION);
    
    const init = async () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = config.canvasWidth;
      canvas.height = config.canvasHeight;

      const loadImg = (s: string) => new Promise<HTMLImageElement>((r) => {
        const i = new Image(); i.src = s; i.onload = () => r(i); i.onerror = () => r(null as any);
      });

      assetsRef.current.bgFar = await loadImg("/assets/images/bg_far.png");
      assetsRef.current.bgMid = await loadImg("/assets/images/bg_mid.png");
      assetsRef.current.ground = await loadImg("/assets/images/ground.png");

// Spine のアセットローダーを作成
const assetManager = new (spine as any).AssetManager(
  "/assets/spine/player/",
  new (spine as any).Downloader()
);

// プレイヤー用 Spine データを読み込み
assetManager.loadText("char_v2.json");
assetManager.loadTextureAtlas("char_v2.atlas");


      const check = () => {
        if (assetManager.isLoadingComplete()) {
          try {
const atlas = assetManager.get("char_v2.atlas");
const json = assetManager.get("char_v2.json");
const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
const skeletonJson = new spine.SkeletonJson(atlasLoader);
const skeletonData = skeletonJson.readSkeletonData(json);

const skeleton = new spine.Skeleton(skeletonData);

const state = new spine.AnimationState(new spine.AnimationStateData(skeletonData));
state.setAnimation(0, "run", true);

spineRef.current = {
  skeleton,
  state,
  renderer: new spine.SkeletonRenderer(canvas.getContext("2d")!)
};

          } catch (e) {
            console.warn("Spineの初期化エラー:", e);
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

  const update = useCallback((time: number) => {
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !isReady) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    scoreRef.current += dt * 10;
    setCurrentScore(Math.floor(scoreRef.current));
    scrollRef.current.bgFar = (scrollRef.current.bgFar + config.initialSpeed * 0.2) % config.canvasWidth;
    scrollRef.current.bgMid = (scrollRef.current.bgMid + config.initialSpeed * 0.5) % config.canvasWidth;
    scrollRef.current.ground = (scrollRef.current.ground + config.initialSpeed) % config.canvasWidth;

    const p = playerRef.current;
    p.vy += config.gravity;
    p.y += p.vy;
    const gY = config.canvasHeight - config.groundHeight - config.playerHeight;
    if (p.y > gY) { p.y = gY; p.vy = 0; p.jumpCount = 0; }

    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);
    const d = (img: any, x: number, y: number, h: number) => {
      if (img) {
        ctx.drawImage(img, -x, y, config.canvasWidth, h);
        ctx.drawImage(img, -x + config.canvasWidth, y, config.canvasWidth, h);
      }
    };
    d(assetsRef.current.bgFar, scrollRef.current.bgFar, 0, config.canvasHeight);
    d(assetsRef.current.bgMid, scrollRef.current.bgMid, 0, config.canvasHeight);
    d(assetsRef.current.ground, scrollRef.current.ground, config.canvasHeight - config.groundHeight, config.groundHeight);

    if (spineRef.current) {
      const { skeleton, state, renderer } = spineRef.current;
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      skeleton.x = 80;
      skeleton.y = p.y + config.playerHeight;
      renderer.draw(skeleton);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [isReady]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  return (
    <div className="w-full h-full relative" onMouseDown={() => {
      if (playerRef.current.jumpCount < config.maxJumps) {
        playerRef.current.vy = config.jumpStrength;
        playerRef.current.jumpCount++;
        if (spineRef.current) {
          spineRef.current.state.setAnimation(0, "jump", false);
          spineRef.current.state.addAnimation(0, "run", true, 0);
        }
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
