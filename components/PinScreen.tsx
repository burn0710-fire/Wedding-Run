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
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  return (
    <div className="flex h-full w-full bg-orange-50 p-4 items-center justify-center">
      <div className="flex w-full max-w-4xl gap-8">
        
        {/* Left Side: Display & Prompt */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="mb-4 text-center">
            <h1 className="text-xl font-bold text-orange-800 mb-1">{eventConfig.title}</h1>
            <p className="text-base text-gray-600">合言葉(4けた)を入れてね</p>
          </div>

          <div className="mb-4">
            <div className={`
              flex items-center justify-center text-4xl font-mono tracking-widest
              w-48 h-16 bg-white rounded-xl border-2 shadow-inner
              ${error ? 'border-red-500 text-red-500' : 'border-orange-200 text-gray-800'}
            `}>
              {input.padEnd(4, '•').split('').map((char, i) => (
                <span key={i} className="mx-1">{i < input.length ? char : '•'}</span>
              ))}
            </div>
            {error && <p className="text-red-500 text-center mt-1 text-sm font-bold">ちがうみたいです</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={input.length !== 4}
            className={`
              w-48 py-3 rounded-xl text-lg font-bold shadow-lg transition-all hidden md:block
              ${input.length === 4 
                ? 'bg-orange-500 text-white active:scale-95 shadow-orange-500/30' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            決定
          </button>
        </div>

        {/* Right Side: Keypad */}
        <div className="flex-1 max-w-sm">
          <div className="grid grid-cols-3 gap-2 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumClick(num.toString())}
                className="h-14 sm:h-16 bg-white rounded-lg shadow-sm active:bg-orange-100 text-2xl font-bold text-orange-900 border-b-2 border-orange-100"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="h-14 sm:h-16 bg-red-50 rounded-lg shadow-sm active:bg-red-100 text-base font-bold text-red-600 border-b-2 border-red-100"
            >
              消す
            </button>
            <button
              onClick={() => handleNumClick('0')}
              className="h-14 sm:h-16 bg-white rounded-lg shadow-sm active:bg-orange-100 text-2xl font-bold text-orange-900 border-b-2 border-orange-100"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="h-14 sm:h-16 bg-gray-50 rounded-lg shadow-sm active:bg-gray-100 text-xl font-bold text-gray-600 border-b-2 border-gray-200"
            >
              ←
            </button>
          </div>
          
          {/* Mobile only submit button in column */}
          <button
            onClick={handleSubmit}
            disabled={input.length !== 4}
            className={`
              mt-4 w-full py-3 rounded-xl text-lg font-bold shadow-lg transition-all md:hidden
              ${input.length === 4 
                ? 'bg-orange-500 text-white active:scale-95 shadow-orange-500/30' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            決定
          </button>
        </div>
      </div>
    </div>
  );
};

export default PinScreen;