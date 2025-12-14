import React, { useState } from 'react';
import participants from '../config/participants';
import eventConfig from '../config/event';
import { saveScore } from '../services/firebase';

interface ResultScreenProps {
  score: number;
  onRetry: () => void;
  onShowRanking: () => void;
}

const ResultScreen: React.FC<ResultScreenProps> = ({ score, onRetry, onShowRanking }) => {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedName || isSubmitting) return;

    setIsSubmitting(true);
    const success = await saveScore(eventConfig.eventId, selectedName, score);
    setIsSubmitting(false);

    if (success) {
      setHasSubmitted(true);
      // Optional: Auto redirect to ranking after delay? 
      // User requested "Game back" button, so we might just stay here or show a success message.
      // Let's redirect to ranking to show their position.
      setTimeout(() => {
        onShowRanking();
      }, 1000);
    } else {
      alert("通信エラーが発生しました。もう一度試してください。");
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-orange-50 animate-fade-in">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-orange-800 mb-2">登録完了！</h2>
        <p className="text-gray-600">ランキングへ移動します...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header Result */}
      <div className="flex-none p-6 text-center bg-white shadow-sm z-10">
        <h2 className="text-gray-500 text-sm font-bold uppercase tracking-wide">Game Over</h2>
        <div className="text-5xl font-black text-orange-500 my-2">{score}</div>
        <p className="text-xs text-gray-400">名前を選んでスコアを登録しよう</p>
      </div>

      {/* Scrollable Name List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 pb-20">
          {participants.names.map((name) => (
            <button
              key={name}
              onClick={() => setSelectedName(name)}
              className={`
                p-3 rounded-lg text-sm font-bold shadow-sm border-2 transition-all text-left
                ${selectedName === name 
                  ? 'bg-orange-100 border-orange-500 text-orange-900 ring-2 ring-orange-200' 
                  : 'bg-white border-transparent text-gray-700 hover:bg-gray-50'}
              `}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex-none p-4 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
        <button
          onClick={handleSubmit}
          disabled={!selectedName || isSubmitting}
          className={`
            w-full py-4 rounded-xl text-lg font-bold shadow-lg mb-3 transition-all
            ${selectedName 
              ? 'bg-orange-500 text-white active:scale-95 shadow-orange-500/30' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
          `}
        >
          {isSubmitting ? '送信中...' : 'ランキングに登録'}
        </button>

        <button
          onClick={onRetry}
          className="w-full py-3 rounded-xl text-gray-600 font-bold hover:bg-gray-100 transition-colors"
        >
          登録せずにもう一回
        </button>
      </div>
    </div>
  );
};

export default ResultScreen;