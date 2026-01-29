import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as spine from "@esotericsoftware/spine-canvas";
import gameConfigData from '../config/game';
import assetConfig from '../config/assets';
import { GameConfig, PlayerState, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// 画像読み込み用ヘルパー
const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
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
  
  // Spine関連のRef
  const spineRef = useRef<{
    skeleton: spine.Skeleton;
    state: spine.AnimationState;
    renderer: spine.SkeletonRenderer;
    assetManager: spine.AssetManager;
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

  // --- Spine アセットの読み込み ---
  const loadSpineAssets = async (canvas: HTMLCanvasElement) => {
    const baseUrl = "assets/";
    const assetManager = new spine.AssetManager(baseUrl);

    // ファイルをリクエスト
    assetManager.loadText("player.json");
    assetManager.loadTextureAtlas("player.atlas");

    // 読み込み完了を待機
    await assetManager.waitForAssets();

    // スケルトンとアニメーションの設定
    const atlas = assetManager.require("player.atlas");
    const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
    const skeletonJson = new spine.SkeletonJson(atlasLoader);
    const skeletonData = skeletonJson.readSkeletonData(assetManager.require("player.json"));
    
    const skeleton = new spine.Skeleton(skeletonData);
    const stateData = new spine.AnimationStateData(skeletonData);
    const state = new spine.AnimationState(stateData);
    const renderer = new spine.SkeletonRenderer(canvas.getContext("2d")!);

    // 初期ポーズとアニメーション
    skeleton.setScale(0.3, 0.3); // サイズ調整（必要に応じて変更してください）
    state.setAnimation(0, "run", true);

    spineRef.current = { skeleton, state, renderer, assetManager };
  };

  const setupCanvas = (canvas: HTMLCanvasElement) => {
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;
  };

  const initGame = useCallback(async () => {
    if (!canvasRef.current) return;
    setupCanvas(canvasRef.current);

    // Spine読み込み
    await loadSpineAssets(canvasRef.current);

    // 背景などの画像読み込み
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
    if (type === 'FLY_SMALL' || type === 'FLY_LARGE') {
      y -= 80 + Math.random() * 100;
    }

    const obstacle: Obstacle = {
      id: Math.random(),
      x: config.canvasWidth,
      y,
      width: type.includes('LARGE') ? 80 : 50,
      height: type.includes('LARGE') ? 80 : 50,
      type,
    };
    obstaclesRef.current.push(obstacle);
  }, []);

  const update = useCallback((time: number) => {
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    // ゲームオーバー時は停止
    if (playerRef.current.state === PlayerState.CRASHED) return;

    // スコアと速度の更新
    scoreRef.current += dt * 10;
    setCurrentScore(Math.floor(scoreRef.current));
    scrollRef.current.speed = config.initialSpeed + (scoreRef.current / 100);

    // 背景スクロール
    scrollRef.current.bgFar = (scrollRef.current.bgFar + scrollRef.current.speed * 0.2) % config.canvasWidth;
    scrollRef.current.bgMid = (scrollRef.current.bgMid + scrollRef.current.speed * 0.5) % config.canvasWidth;
    scrollRef.current.ground = (scrollRef.current.ground + scrollRef.current.speed) % config.canvasWidth;

    // 重力計算
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

    // 障害物生成
    if (Math.random() < 0.015) spawnObstacle();

    // 障害物移動と衝突判定
    obstaclesRef.current = obstaclesRef.current.filter(obs => {
      obs.x -= scrollRef.current.speed;
      
      const hitX = player.y < obs.y + obs.height && player.y + config.playerHeight > obs.y;
      const hitY = 50 < obs.x + obs.width && 50 + config.playerWidth > obs.x;
