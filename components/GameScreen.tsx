import React, { useEffect, useRef, useState, useCallback } from 'react';
import gameConfigData from '../config/game';
import { GameConfig, PlayerState, Obstacle, ObstacleType } from '../types';

const config: GameConfig = gameConfigData;

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState(0); // For UI display only
  
  // Game State Refs
  const gameState = useRef({
    isPlaying: true,
    speed: config.initialSpeed,
    frameCount: 0,
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

  // --- JUMP LOGIC (Variable Jump Height) ---
  
  // 1. Start Jump (Full power on press)
  const startJump = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    // Prevent default to avoid double firing on some devices (though touch-action: none helps)
    // e?.preventDefault(); 

    const state = gameState.current;
    if (!state.player.isJumping && state.isPlaying) {
      state.player.dy = config.jumpStrength; // Apply full jump force
      state.player.isJumping = true;
    }
  }, []);

  // 2. End Jump (Cut velocity on release)
  const endJump = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    // e?.preventDefault();
    
    const state = gameState.current;
    // If the player is currently moving UP (negative dy) and releases the button,
    // we cut the upward velocity significantly. This creates the "short hop".
    // We only cut if dy is significantly negative to avoid weird physics at the peak.
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

      // 2. Player Physics
      state.player.dy += config.gravity;
      state.player.y += state.player.dy;

      const playerGroundY = groundY - state.player.height;
      if (state.player.y > playerGroundY) {
        state.player.y = playerGroundY;
        state.player.dy = 0;
        state.player.isJumping = false;
      }

      // 3. Obstacles Spawning with High Randomness
      state.frameCount++;
      
      if (state.frameCount > state.nextSpawnThreshold) {
        state.frameCount = 0;
        
        // --- Randomize Obstacle Appearance ---
        const typeRand = Math.random();
        let type: ObstacleType;
        let width = 30;
        let height = 30;
        let yPos = groundY;

        // More variability in size
        const sizeVariance = () => Math.floor(Math.random() * 20) - 5; // -5 to +15

        if (typeRand < 0.4) {
          // 40% Ground Small (Variable width/height)
          type = 'GROUND_SMALL';
          width = 25 + Math.random() * 15; // 25-40
          height = 25 + Math.random() * 15; // 25-40
          yPos = groundY - height;
        } else if (typeRand < 0.7) {
          // 30% Ground Large (Tall or Wide)
          type = 'GROUND_LARGE';
          width = 30 + Math.random() * 20; // 30-50
          height = 45 + Math.random() * 25; // 45-70
          yPos = groundY - height;
        } else if (typeRand < 0.9) {
          // 20% Flying Small (Random Height)
          type = 'FLYING_SMALL';
          width = 25 + Math.random() * 10;
          height = 20 + Math.random() * 10;
          // Height varies between just above head to jumpable
          const heightVariance = Math.random() * 40; 
          yPos = groundY - 45 - heightVariance; 
        } else {
          // 10% Flying Large (High up)
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

        // --- Calculate NEXT Spawn Threshold (The Core of Randomness) ---
        // Basic physics: Jump takes approx 40-45 frames.
        // We want a mix of "Tight Clusters" (immediate next jump) and "Long Gaps".
        
        const minSafetyFrames = 40; // Approx frames to land
        
        // Speed Adjustment: As speed increases, we cover more distance per frame, 
        // so frames can stay roughly similar for rhythm, but we reduce max gaps to make it harder.
        
        const clusterChance = 0.35; // 35% chance of a quick follow-up
        
        if (Math.random() < clusterChance) {
          // CLUSTER MODE: Very tight gap (panic inducing)
          // 45 to 65 frames
          state.nextSpawnThreshold = minSafetyFrames + 5 + Math.random() * 20;
        } else {
          // RELAXED MODE: Wide variation
          // 60 to 180 frames (large gap possible)
          // As speed goes up, reduce the max wait time so it doesn't get boring
          const maxWait = Math.max(80, 200 - (state.speed * 5)); 
          state.nextSpawnThreshold = minSafetyFrames + 20 + Math.random() * (maxWait - 60);
        }
      }

      // 4. Obstacles Movement & Collision
      state.obstacles.forEach(obs => {
        obs.x -= state.speed;
        
        if (obs.x + obs.width < -100) {
          obs.markedForDeletion = true;
        }

        // Collision Detection (AABB) with forgiving padding
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
    const dpr = window.devicePixelRatio || 1;
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    ctx.save();
    ctx.scale(scale, scale);

    // 1. Draw Background
    ctx.fillStyle = '#fef3c7'; 
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // 2. Draw Ground
    ctx.fillStyle = '#d97706'; 
    ctx.fillRect(0, groundY, logicalWidth, groundHeight);

    // 3. Draw Player
    state.player.x = 50; 
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(state.player.x, state.player.y, state.player.width, state.player.height);
    
    ctx.fillStyle = '#333';
    if (state.isPlaying) {
        ctx.fillRect(state.player.x + 25, state.player.y + 10, 5, 5);
    } else {
        ctx.beginPath();
        ctx.moveTo(state.player.x + 24, state.player.y + 9);
        ctx.lineTo(state.player.x + 29, state.player.y + 14);
        ctx.moveTo(state.player.x + 29, state.player.y + 9);
        ctx.lineTo(state.player.x + 24, state.player.y + 14);
        ctx.stroke();
    }

    // 4. Draw Obstacles
    state.obstacles.forEach(obs => {
        if (obs.type === 'GROUND_SMALL') {
            ctx.fillStyle = '#166534';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'GROUND_LARGE') {
            ctx.fillStyle = '#14532d';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.fillStyle = '#166534';
            ctx.fillRect(obs.x + 5, obs.y + 5, obs.width - 10, obs.height - 10);
        } else if (obs.type === 'FLYING_SMALL') {
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y);
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
            ctx.lineTo(obs.x, obs.y + obs.height);
            ctx.fill();
            ctx.fillStyle = '#60a5fa';
            if (Math.floor(obs.x / 20) % 2 === 0) {
                ctx.fillRect(obs.x + 5, obs.y - 10, 10, 10);
            } else {
                ctx.fillRect(obs.x + 5, obs.y + 5, 10, 10);
            }
        } else if (obs.type === 'FLYING_LARGE') {
            ctx.fillStyle = '#7c3aed';
            ctx.beginPath();
            ctx.ellipse(obs.x + obs.width/2, obs.y + obs.height/2, obs.width/2, obs.height/2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillRect(obs.x + 10, obs.y + 10, 5, 5);
            ctx.fillRect(obs.x + 25, obs.y + 10, 5, 5);
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