import React, { useState, useEffect } from 'react';
import { AppState } from './types';
import eventConfig from './config/event';
import PinScreen from './components/PinScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import RankingScreen from './components/RankingScreen';

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [lastScore, setLastScore] = useState(0);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    // Orientation check handler
    const checkOrientation = () => {
      // Simple check: if height > width, it's portrait
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    // Initial check
    checkOrientation();

    // Listen for resize/orientation change
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  useEffect(() => {
    // Initial load check
    const storedPin = localStorage.getItem(`pin_${eventConfig.eventId}`);
    
    setTimeout(() => {
      if (storedPin === eventConfig.pin) {
        setAppState(AppState.TITLE);
      } else {
        setAppState(AppState.PIN);
      }
    }, 500);
  }, []);

  const startGame = () => setAppState(AppState.GAME);
  
  const handlePinSuccess = () => {
    setAppState(AppState.TITLE);
  };

  const handleGameOver = (score: number) => {
    setLastScore(score);
    setAppState(AppState.RESULT);
  };

  const handleRetry = () => {
    setAppState(AppState.GAME);
  };

  const showRanking = () => {
    setAppState(AppState.RANKING);
  };

  const backToTitle = () => {
    setAppState(AppState.TITLE);
  };

  // --- RENDER ---

  // 1. Force Landscape Warning
  if (isPortrait) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center z-50">
        <div className="text-6xl mb-4 animate-bounce">📱↔️</div>
        <h1 className="text-2xl font-bold mb-2">画面を横向きにしてください</h1>
        <p className="text-gray-400 text-sm">
          このゲームは横画面専用です。<br />
          スマートフォンの向きを変えて遊んでください。
        </p>
      </div>
    );
  }

  if (appState === AppState.LOADING) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-orange-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (appState === AppState.PIN) {
    return <PinScreen onSuccess={handlePinSuccess} />;
  }

  if (appState === AppState.TITLE) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-orange-50 p-6">
        {/* Landscape Layout: Left Title, Right Buttons */}
        <div className="flex w-full max-w-4xl items-center justify-around">
          
          <div className="flex-1 text-center lg:text-left p-4">
            <p className="text-orange-600 font-bold tracking-widest uppercase mb-2 text-sm md:text-base">
              {eventConfig.subTitle}
            </p>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-slate-800 leading-tight">
              {eventConfig.title}
            </h1>
            <div className="mt-4 text-gray-400 text-xs md:text-sm hidden md:block">
              タップでジャンプするだけの簡単ゲーム！
            </div>
          </div>
          
          <div className="flex-1 max-w-sm space-y-4 p-4">
            <button 
              onClick={startGame}
              className="w-full py-4 md:py-6 bg-orange-500 text-white rounded-2xl text-2xl md:text-3xl font-bold shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
            >
              START
            </button>
            
            <button 
              onClick={showRanking}
              className="w-full py-3 md:py-4 bg-white text-orange-600 rounded-2xl text-lg font-bold shadow-md active:bg-gray-50 transition-colors"
            >
              ランキングを見る
            </button>
          </div>

        </div>
      </div>
    );
  }

  if (appState === AppState.GAME) {
    return <GameScreen onGameOver={handleGameOver} />;
  }

  if (appState === AppState.RESULT) {
    return (
      <ResultScreen 
        score={lastScore} 
        onRetry={handleRetry} 
        onShowRanking={showRanking} 
      />
    );
  }

  if (appState === AppState.RANKING) {
    return <RankingScreen onBack={backToTitle} />;
  }

  return null;
}

export default App;