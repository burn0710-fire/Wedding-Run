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

  useEffect(() => {
    // Initial load check
    // 1. Check if PIN is already stored
    const storedPin = localStorage.getItem(`pin_${eventConfig.eventId}`);
    
    // Simulate short load for better UX
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
    // Add a small delay so user sees "Game Over" moment on canvas if implemented
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
      <div className="h-full w-full flex flex-col items-center justify-center bg-orange-50 p-6 text-center">
        <div className="mb-8">
          <p className="text-orange-600 font-bold tracking-widest uppercase mb-2">{eventConfig.subTitle}</p>
          <h1 className="text-5xl font-black text-slate-800 leading-tight">{eventConfig.title}</h1>
        </div>
        
        <div className="w-full max-w-xs space-y-4">
          <button 
            onClick={startGame}
            className="w-full py-5 bg-orange-500 text-white rounded-2xl text-2xl font-bold shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
          >
            START
          </button>
          
          <button 
            onClick={showRanking}
            className="w-full py-4 bg-white text-orange-600 rounded-2xl text-lg font-bold shadow-md active:bg-gray-50 transition-colors"
          >
            ランキングを見る
          </button>
        </div>

        <div className="mt-12 text-gray-400 text-sm">
          タップでジャンプするだけの簡単ゲーム！
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