import React, { useState, useEffect } from 'react';
import eventConfig from '../config/event';

interface PinScreenProps {
  onSuccess: () => void;
}

const PinScreen: React.FC<PinScreenProps> = ({ onSuccess }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  // Check LocalStorage on mount to skip if already entered
  useEffect(() => {
    const storedPin = localStorage.getItem(`pin_${eventConfig.eventId}`);
    if (storedPin === eventConfig.pin) {
      onSuccess();
    }
  }, [onSuccess]);

  const handleNumClick = (num: string) => {
    setError(false);
    if (input.length < 4) {
      setInput((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setError(false);
    setInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError(false);
    setInput('');
  };

  const handleSubmit = () => {
    if (input === eventConfig.pin) {
      localStorage.setItem(`pin_${eventConfig.eventId}`, input);
      onSuccess();
    } else {
      setError(true);
      setInput('');
      // Vibrate for feedback if supported
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-orange-50">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-orange-800 mb-2">{eventConfig.title}</h1>
        <p className="text-lg text-gray-600">合言葉(4けた)を入れてね</p>
      </div>

      <div className="mb-6">
        <div className={`
          flex items-center justify-center text-4xl font-mono tracking-widest
          w-48 h-16 bg-white rounded-xl border-2 shadow-inner
          ${error ? 'border-red-500 text-red-500' : 'border-orange-200 text-gray-800'}
        `}>
          {input.padEnd(4, '•').split('').map((char, i) => (
            <span key={i} className="mx-1">{i < input.length ? char : '•'}</span>
          ))}
        </div>
        {error && <p className="text-red-500 text-center mt-2 text-sm font-bold">ちがうみたいです</p>}
      </div>

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleNumClick(num.toString())}
            className="h-20 bg-white rounded-lg shadow-md active:bg-orange-100 active:shadow-sm text-3xl font-bold text-orange-900 border-b-4 border-orange-100"
          >
            {num}
          </button>
        ))}
        <button
          onClick={handleClear}
          className="h-20 bg-red-50 rounded-lg shadow-md active:bg-red-100 text-lg font-bold text-red-600 border-b-4 border-red-100"
        >
          消す
        </button>
        <button
          onClick={() => handleNumClick('0')}
          className="h-20 bg-white rounded-lg shadow-md active:bg-orange-100 text-3xl font-bold text-orange-900 border-b-4 border-orange-100"
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          className="h-20 bg-gray-50 rounded-lg shadow-md active:bg-gray-100 text-lg font-bold text-gray-600 border-b-4 border-gray-200"
        >
          ←
        </button>
      </div>

      <button
        onClick={handleSubmit}
        disabled={input.length !== 4}
        className={`
          mt-6 w-full max-w-xs py-4 rounded-xl text-xl font-bold shadow-lg transition-all
          ${input.length === 4 
            ? 'bg-orange-500 text-white active:scale-95 shadow-orange-500/30' 
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
        `}
      >
        決定
      </button>
    </div>
  );
};

export default PinScreen;