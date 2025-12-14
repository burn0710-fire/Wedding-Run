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
    
    // Use the parent dimensions properly
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set actual canvas pixels
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Reset scale in context
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      ctx.scale(dpr, dpr);
    }
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
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;
    const parent = canvas.parentElement;
    if(!parent) return;
    
    // Recalculate Logic Dimensions every frame for responsiveness
    // Logic height is fixed at 300 to maintain consistent gameplay physics regardless of screen size
    const logicalHeight = 300; 
    const rect = parent.getBoundingClientRect();
    
    // Scale factor to fit logical height into actual pixel height
    // e.g. if screen height is 600px, scale is 2.
    const scale = rect.height / logicalHeight;
    
    // Logical width depends on aspect ratio
    const logicalWidth = rect.width / scale;

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
      const nextSpawn = Math.random() * (config.spawnRateMax - config.spawnRateMin) + config.spawnRateMin;
      
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
    const dpr = window.devicePixelRatio || 1;
    
    // Clear whole canvas (use actual width/height)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to pixels for clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Set scale for drawing logical coords
    ctx.save();
    ctx.scale(scale, scale);

    // 1. Draw Background (Sky)
    ctx.fillStyle = '#fef3c7'; // warm yellow/orange bg
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // 2. Draw Ground
    ctx.fillStyle = '#d97706'; // dark orange
    ctx.fillRect(0, logicalHeight - 20, logicalWidth, 20);

    // 3. Draw Player
    state.player.x = 50; 
    
    // Placeholder Player
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(state.player.x, state.player.y, state.player.width, state.player.height);
    
    // Simple eye
    ctx.fillStyle = '#333';
    ctx.fillRect(state.player.x + 25, state.player.y + 10, 5, 5);

    // 4. Draw Obstacles
    state.obstacles.forEach(obs => {
        // Placeholder Obstacle
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
  }, [onGameOver, currentScore]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        setupCanvas(canvasRef.current);
      }
    };
    
    window.addEventListener('resize', handleResize);
    // Initial setup
    if (canvasRef.current) setupCanvas(canvasRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Init Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  // Touch handlers
  const handleTouch = (e: React.TouchEvent | React.MouseEvent) => {
    // e.preventDefault();
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