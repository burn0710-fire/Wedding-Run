import React, { useEffect, useState } from 'react';
import { getRanking } from '../services/firebase';
import eventConfig from '../config/event';
import { ScoreEntry } from '../types';

interface RankingScreenProps {
  onBack: () => void;
}

const RankingScreen: React.FC<RankingScreenProps> = ({ onBack }) => {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await getRanking(eventConfig.eventId);
      setScores(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return '👑';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return `${index + 1}`;
    }
  };

  return (
    <div className="flex flex-col h-full bg-orange-50">
      {/* Compact Header for Landscape */}
      <div className="flex-none p-2 px-4 bg-white shadow-sm flex items-center justify-between z-10 h-14">
        <h2 className="text-lg font-bold text-orange-800">ランキング</h2>
        <button 
          onClick={onBack}
          className="px-4 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600 active:bg-gray-200"
        >
          ゲームに戻る
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : scores.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            <p>まだ記録がありません。</p>
            <p className="text-sm mt-2">一番乗りを目指そう！</p>
          </div>
        ) : (
          <div className="space-y-2 pb-10 max-w-3xl mx-auto">
            {scores.map((entry, index) => (
              <div 
                key={entry.id || index}
                className={`
                  flex items-center p-3 rounded-xl shadow-sm border-b-2
                  ${index === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}
                `}
              >
                <div className={`
                  w-8 h-8 flex items-center justify-center text-lg font-bold mr-3 rounded-full
                  ${index < 3 ? 'bg-white shadow-sm' : 'text-gray-400'}
                `}>
                  {getRankIcon(index)}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm md:text-base">{entry.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {entry.timestamp?.seconds 
                      ? new Date(entry.timestamp.seconds * 1000).toLocaleDateString() 
                      : 'Just now'}
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-black text-orange-600 font-mono">
                  {entry.score}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RankingScreen;