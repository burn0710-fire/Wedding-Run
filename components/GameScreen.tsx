import React, { useEffect, useRef, useState, useCallback } from 'react';
import gameConfigData from '../config/game';
import { GameConfig, PlayerState, Obstacle } from '../types';

const config: GameConfig = gameConfigData;

interface GameScreenProps {
  onGameOver: (score: number) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState(0); // For UI display only
  
  // Game State Refs (using Refs for mutable game loop state without re-renders)
  const gameState = useRef({
    isPlaying: true,
    speed: config.initialSpeed,
    frameCount: 0,
    player: {
      x: 50,
      y: 0,
      dy: 0,
      isJumping: false,
      width: 40,  // Base size, will scale
      height: 40
    } as PlayerState,
    obstacles: [] as Obstacle[]
  });

  // Setup Canvas scaling for high DPI and responsiveness
  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const parent = canvas.parentElement;
    if (!parent) return;
    
    // Maintain aspect ratio or fill? Let's fill width, fixed aspect ratio of ~16:9 equivalent
    // Ideally for a mobile game, full height is good, but we want a "lane" feel.
    // Let's use the parent container size.
    
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    
    // Store logic dimensions (independent of pixels)
    // We will treat the "game world" as having a fixed height of 300 units
    // and dynamic width based on aspect ratio.
    const scaleFactor = rect.height / 300; 
    
    return { width: rect.width, height: rect.height, scaleFactor, ctx };
  };

  const jump = useCallback(() => {
    const state = gameState.current;
    if (!state.player.isJumping && state.isPlaying) {
      state.player.dy = config.jumpStrength;
      state.player.isJumping = true;
    }
  }, []);

  // Main Loop
  const update = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // We need to re-get dimensions in case of resize, 
    // but for performance in this loop we assume fixed setup from init
    // Actually, just get context for drawing.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;
    const parent = canvas.parentElement;
    if(!parent) return;
    
    // Logic Dimensions
    const logicalHeight = 300;
    const scale = parent.getBoundingClientRect().height / logicalHeight;
    const logicalWidth = parent.getBoundingClientRect().width / scale;

    // --- UPDATE LOGIC ---
    if (state.isPlaying) {
      // 1. Difficulty Scaling
      state.speed = Math.min(config.maxSpeed, state.speed + config.acceleration);
      scoreRef.current += 0.1 * (state.speed / config.initialSpeed);
      
      // Update UI score less frequently to save React renders
      if (Math.floor(scoreRef.current) > currentScore) {
        setCurrentScore(Math.floor(scoreRef.current));
      }

      // 2. Player Physics
      state.player.dy += config.gravity;
      state.player.y += state.player.dy;

      // Ground collision
      // Ground is at logicalHeight - 20 (padding) - playerHeight
      const groundY = logicalHeight - 20 - state.player.height;
      
      if (state.player.y > groundY) {
        state.player.y = groundY;
        state.player.dy = 0;
        state.player.isJumping = false;
      }

      // 3. Obstacles Spawning
      state.frameCount++;
      // Random spawn interval
      const nextSpawn = Math.random() * (config.spawnRateMax - config.spawnRateMin) + config.spawnRateMin;
      // Adjust spawn rate based on speed (faster speed = spawn closer in time to keep distance same? No, purely time based is fine for simple game)
      if (state.frameCount > nextSpawn) {
        state.frameCount = 0;
        state.obstacles.push({
          x: logicalWidth + 50, // Start off screen
          y: groundY + 10, // Slightly lower for visual anchor
          width: 30,
          height: 30,
          markedForDeletion: false
        });
      }

      // 4. Obstacles Movement & Collision
      state.obstacles.forEach(obs => {
        obs.x -= state.speed;
        
        // Remove if off screen
        if (obs.x + obs.width < -100) {
          obs.markedForDeletion = true;
        }

        // Collision Detection (AABB)
        // Hitbox padding to be forgiving
        const pPadding = 5;
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

      // Cleanup obstacles
      state.obstacles = state.obstacles.filter(o => !o.markedForDeletion);
    }

    // --- RENDER ---
    // Clear
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state for scaling
    ctx.save();
    ctx.scale(dpr * scale, dpr * scale);

    // 1. Draw Background (Sky)
    // You can replace this with `ctx.drawImage(bgImage, 0, 0, ...)`
    ctx.fillStyle = '#fef3c7'; // warm yellow/orange bg
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // 2. Draw Ground
    ctx.fillStyle = '#d97706'; // dark orange
    ctx.fillRect(0, logicalHeight - 20, logicalWidth, 20);

    // 3. Draw Player
    // Define player X position fixed
    state.player.x = 50; 
    
    // --- ASSET REPLACEMENT: PLAYER ---
    // Uncomment the lines below and load your image in useEffect to use a sprite
    // ctx.drawImage(playerImg, state.player.x, state.player.y, state.player.width, state.player.height);
    
    // Placeholder Player (White Box with border)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(state.player.x, state.player.y, state.player.width, state.player.height);
    
    // Simple eye to show direction
    ctx.fillStyle = '#333';
    ctx.fillRect(state.player.x + 25, state.player.y + 10, 5, 5);

    // 4. Draw Obstacles
    state.obstacles.forEach(obs => {
        // --- ASSET REPLACEMENT: OBSTACLE ---
        // ctx.drawImage(cactusImg, obs.x, obs.y, obs.width, obs.height);

        // Placeholder Obstacle (Red Triangle-ish)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.height);
        ctx.lineTo(obs.x + obs.width / 2, obs.y);
        ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
        ctx.fill();
    });

    // Restore context
    ctx.restore();

    requestRef.current = requestAnimationFrame(update);
  }, [onGameOver, currentScore]); // currentScore dependency is handled via ref, but listed to keep lint happy if needed, strictly not needed for logic

  // Init Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setupCanvas(canvas);
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  // Touch handlers
  const handleTouch = (e: React.TouchEvent | React.MouseEvent) => {
    // Prevent default to stop scrolling or zooming double taps
    // e.preventDefault(); // Sometimes interferes with React synthetic events, handled in CSS
    jump();
  };

  return (
    <div 
      className="relative w-full h-full bg-slate-200 overflow-hidden select-none"
      onMouseDown={handleTouch}
      onTouchStart={handleTouch}
    >
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full"
      />
      
      {/* Score HUD */}
      <div className="absolute top-4 right-4 bg-white/80 px-4 py-2 rounded-full font-mono text-xl font-bold text-orange-600 shadow-sm border border-orange-100 pointer-events-none">
        SCORE: {Math.floor(scoreRef.current).toString().padStart(5, '0')}
      </div>

      {/* Tap Instruction (only at start) */}
      {scoreRef.current < 5 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none animate-pulse">
          <p className="text-3xl font-black text-orange-500/50">TAP TO JUMP</p>
        </div>
      )}
    </div>
  );
};

export default GameScreen;