import React, { useEffect, useRef, useState, useCallback } from 'react';
import gameConfigData from '../config/game';
import assetConfig from '../config/assets';
import { GameConfig, PlayerState, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

// Image Loader Helper
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
  const [currentScore, setCurrentScore] = useState(0); // For UI display only
  
  // Loaded Assets Ref
  const assetsRef = useRef({
    bgFar: null as HTMLImageElement | null,
    bgMid: null as HTMLImageElement | null,
    ground: null as HTMLImageElement | null,
    player: null as HTMLImageElement | null,
    obsGroundSmall: null as HTMLImageElement | null,
    obsGroundLarge: null as HTMLImageElement | null,
    obsFlySmall: null as HTMLImageElement | null,
    obsFlyLarge: null as HTMLImageElement | null,
    loaded: false
  });

  // Game State Refs
  const gameState = useRef({
    isPlaying: true,
    speed: config.initialSpeed,
    frameCount: 0,
    bgFarOffset: 0,
    bgMidOffset: 0,
    nextSpawnThreshold: 0, // Next spawn frame count target
    player: {
      x: 50,
      y: 0,
      dy: 0,
      isJumping: false,
      width: 40,  // Base size
      height: 40
    } as PlayerState,
    obstacles: [] as Obstacle[]
  });

  // Setup Canvas scaling
  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const parent = canvas.parentElement;
    if (!parent) return;
    
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
  };

  // --- ASSET LOADING ---
  useEffect(() => {
    const loadAllAssets = async () => {
      const [
        bgFar, bgMid, ground, player,
        obsGS, obsGL, obsFS, obsFL
      ] = await Promise.all([
        loadImage(assetConfig.BACKGROUND.FAR.path),
        loadImage(assetConfig.BACKGROUND.MID.path),
        loadImage(assetConfig.GROUND.path),
        loadImage(assetConfig.PLAYER.IMAGE_PATH),
        loadImage(assetConfig.OBSTACLES.GROUND_SMALL.path),
        loadImage(assetConfig.OBSTACLES.GROUND_LARGE.path),
        loadImage(assetConfig.OBSTACLES.FLYING_SMALL.path),
        loadImage(assetConfig.OBSTACLES.FLYING_LARGE.path),
      ]);

      assetsRef.current = {
        bgFar, bgMid, ground, player,
        obsGroundSmall: obsGS,
        obsGroundLarge: obsGL,
        obsFlySmall: obsFS,
        obsFlyLarge: obsFL,
        loaded: true
      };
    };

    loadAllAssets();
  }, []);

  // --- JUMP LOGIC (Variable Jump Height) ---
  
  // 1. Start Jump (Full power on press)
  const startJump = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    const state = gameState.current;
    if (!state.player.isJumping && state.isPlaying) {
      state.player.dy = config.jumpStrength; // Apply full jump force
      state.player.isJumping = true;
    }
  }, []);

  // 2. End Jump (Cut velocity on release)
  const endJump = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    const state = gameState.current;
    if (state.player.isJumping && state.player.dy < -2) {
      state.player.dy = state.player.dy * 0.45; // Cut upward momentum to 45%
    }
  }, []);

  // Initialize spawn threshold
  useEffect(() => {
    gameState.current.nextSpawnThreshold = 60; // First spawn
  }, []);

  // Main Loop
  const update = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;
    const assets = assetsRef.current;
    const parent = canvas.parentElement;
    if(!parent) return;
    
    const logicalHeight = 300; 
    const rect = parent.getBoundingClientRect();
    const scale = rect.height / logicalHeight;
    const logicalWidth = rect.width / scale;

    const groundHeight = 20;
    const groundY = logicalHeight - groundHeight;

    // --- UPDATE LOGIC ---
    if (state.isPlaying) {
      // 1. Difficulty Scaling
      state.speed = Math.min(config.maxSpeed, state.speed + config.acceleration);
      scoreRef.current += 0.1 * (state.speed / config.initialSpeed);
      
      if (Math.floor(scoreRef.current) > currentScore) {
        setCurrentScore(Math.floor(scoreRef.current));
      }

      // 2. Background Parallax Scrolling
      // Far background moves at 10% speed
      state.bgFarOffset -= state.speed * 0.1;
      // Mid background moves at 25% speed
      state.bgMidOffset -= state.speed * 0.25;

      const BG_WIDTH = 1000; // Loop width
      if (state.bgFarOffset <= -BG_WIDTH) state.bgFarOffset += BG_WIDTH;
      if (state.bgMidOffset <= -BG_WIDTH) state.bgMidOffset += BG_WIDTH;

      // 3. Player Physics
      state.player.dy += config.gravity;
      state.player.y += state.player.dy;

      const playerGroundY = groundY - state.player.height;
      if (state.player.y > playerGroundY) {
        state.player.y = playerGroundY;
        state.player.dy = 0;
        state.player.isJumping = false;
      }

      // 4. Obstacles Spawning with High Randomness
      state.frameCount++;
      
      if (state.frameCount > state.nextSpawnThreshold) {
        state.frameCount = 0;
        
        // --- Randomize Obstacle Appearance ---
        const typeRand = Math.random();
        let type: ObstacleType;
        let width = 30;
        let height = 30;
        let yPos = groundY;

        if (typeRand < 0.4) {
          type = 'GROUND_SMALL';
          width = 25 + Math.random() * 15;
          height = 25 + Math.random() * 15;
          yPos = groundY - height;
        } else if (typeRand < 0.7) {
          type = 'GROUND_LARGE';
          width = 30 + Math.random() * 20;
          height = 45 + Math.random() * 25;
          yPos = groundY - height;
        } else if (typeRand < 0.9) {
          type = 'FLYING_SMALL';
          width = 25 + Math.random() * 10;
          height = 20 + Math.random() * 10;
          const heightVariance = Math.random() * 40; 
          yPos = groundY - 45 - heightVariance; 
        } else {
          type = 'FLYING_LARGE';
          width = 40 + Math.random() * 20;
          height = 30 + Math.random() * 15;
          const heightVariance = Math.random() * 30;
          yPos = groundY - 60 - heightVariance;
        }

        state.obstacles.push({
          type,
          x: logicalWidth + 50,
          y: yPos, 
          width,
          height,
          markedForDeletion: false
        });

        const minSafetyFrames = 40; 
        const clusterChance = 0.35; 
        
        if (Math.random() < clusterChance) {
          state.nextSpawnThreshold = minSafetyFrames + 5 + Math.random() * 20;
        } else {
          const maxWait = Math.max(80, 200 - (state.speed * 5)); 
          state.nextSpawnThreshold = minSafetyFrames + 20 + Math.random() * (maxWait - 60);
        }
      }

      // 5. Obstacles Movement & Collision
      state.obstacles.forEach(obs => {
        obs.x -= state.speed;
        
        if (obs.x + obs.width < -100) {
          obs.markedForDeletion = true;
        }

        const pPadding = 10; 
        if (
          state.player.x < obs.x + obs.width - pPadding &&
          state.player.x + state.player.width - pPadding > obs.x &&
          state.player.y < obs.y + obs.height - pPadding &&
          state.player.y + state.player.height - pPadding > obs.y
        ) {
          state.isPlaying = false;
          onGameOver(Math.floor(scoreRef.current));
        }
      });

      state.obstacles = state.obstacles.filter(o => !o.markedForDeletion);
    }

    // --- RENDER ---
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    ctx.save();
    ctx.scale(scale, scale);

    // 1. Draw Background
    // Fallback Background Color
    ctx.fillStyle = '#fef3c7'; 
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    const BG_WIDTH = 1000;

    // Draw Far Background (Looping)
    if (assets.bgFar) {
      // Draw 3 tiles to cover screen and scrolling
      for (let i = -1; i < 3; i++) {
        ctx.drawImage(assets.bgFar, state.bgFarOffset + (i * BG_WIDTH), 0, BG_WIDTH, logicalHeight);
      }
    } else {
       // Fallback for Far BG (Simple Mountains)
       ctx.fillStyle = '#fcd34d'; // darker yellow
       ctx.beginPath();
       ctx.moveTo(0, logicalHeight);
       ctx.lineTo(logicalWidth * 0.3 + state.bgFarOffset, logicalHeight - 100);
       ctx.lineTo(logicalWidth * 0.6 + state.bgFarOffset, logicalHeight);
       ctx.fill();
    }

    // Draw Mid Background (Looping)
    if (assets.bgMid) {
      for (let i = -1; i < 3; i++) {
        ctx.drawImage(assets.bgMid, state.bgMidOffset + (i * BG_WIDTH), 0, BG_WIDTH, logicalHeight);
      }
    } else {
        // Fallback for Mid BG (Simple Hills)
        ctx.fillStyle = '#fbbf24'; 
        ctx.beginPath();
        ctx.ellipse(state.bgMidOffset + 200, logicalHeight, 300, 100, 0, 0, Math.PI * 2);
        ctx.ellipse(state.bgMidOffset + 800, logicalHeight, 400, 120, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2. Draw Ground
    if (assets.ground) {
      // Tile the ground texture
      const tileW = 100;
      const numTiles = Math.ceil(logicalWidth / tileW) + 1;
      const offsetX = -(state.frameCount * state.speed) % tileW;
      for (let i = 0; i < numTiles; i++) {
          ctx.drawImage(assets.ground, offsetX + (i * tileW), groundY, tileW, groundHeight);
      }
    } else {
      ctx.fillStyle = '#d97706'; 
      ctx.fillRect(0, groundY, logicalWidth, groundHeight);
    }

    // 3. Draw Player
    state.player.x = 50; 
    
    if (assets.player) {
      ctx.drawImage(assets.player, state.player.x, state.player.y, state.player.width, state.player.height);
    } else {
      // Fallback Player
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(state.player.x, state.player.y, state.player.width, state.player.height);
      
      // Eye
      ctx.fillStyle = '#333';
      if (state.isPlaying) {
          ctx.fillRect(state.player.x + 25, state.player.y + 10, 5, 5);
      } else {
          // X Eye for dead
          ctx.beginPath();
          ctx.moveTo(state.player.x + 24, state.player.y + 9);
          ctx.lineTo(state.player.x + 29, state.player.y + 14);
          ctx.moveTo(state.player.x + 29, state.player.y + 9);
          ctx.lineTo(state.player.x + 24, state.player.y + 14);
          ctx.stroke();
      }
    }

    // 4. Draw Obstacles
    state.obstacles.forEach(obs => {
        let img = null;
        if (obs.type === 'GROUND_SMALL') img = assets.obsGroundSmall;
        else if (obs.type === 'GROUND_LARGE') img = assets.obsGroundLarge;
        else if (obs.type === 'FLYING_SMALL') img = assets.obsFlySmall;
        else if (obs.type === 'FLYING_LARGE') img = assets.obsFlyLarge;

        if (img) {
            ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
        } else {
            // Fallback Rendering
            if (obs.type.includes('GROUND')) {
                ctx.fillStyle = obs.type === 'GROUND_LARGE' ? '#14532d' : '#166534';
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            } else {
                ctx.fillStyle = obs.type === 'FLYING_LARGE' ? '#7c3aed' : '#2563eb';
                ctx.beginPath();
                if (obs.type === 'FLYING_LARGE') {
                    ctx.ellipse(obs.x + obs.width/2, obs.y + obs.height/2, obs.width/2, obs.height/2, 0, 0, Math.PI * 2);
                } else {
                    ctx.moveTo(obs.x, obs.y);
                    ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
                    ctx.lineTo(obs.x, obs.y + obs.height);
                }
                ctx.fill();
            }
        }
    });

    ctx.restore();

    requestRef.current = requestAnimationFrame(update);
  }, [onGameOver, currentScore]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        setupCanvas(canvasRef.current);
      }
    };
    
    window.addEventListener('resize', handleResize);
    if (canvasRef.current) setupCanvas(canvasRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div 
      className="relative w-full h-full bg-slate-200 overflow-hidden select-none"
      onMouseDown={startJump}
      onMouseUp={endJump}
      onMouseLeave={endJump}
      onTouchStart={startJump}
      onTouchEnd={endJump}
    >
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full"
      />
      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm border border-orange-100 pointer-events-none z-10">
        SCORE: {Math.floor(scoreRef.current).toString().padStart(5, '0')}
      </div>
      {scoreRef.current < 5 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none animate-pulse">
          <p className="text-3xl font-black text-orange-500/50">TAP TO JUMP</p>
        </div>
      )}
    </div>
  );
};

export default GameScreen;