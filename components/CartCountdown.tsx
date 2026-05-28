'use client';

import { useState, useEffect } from 'react';

export default function CartCountdown() {
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const savedTime = localStorage.getItem('cartCountdownEnd');
    if (savedTime) {
      const endTime = parseInt(savedTime);
      const now = Date.now();
      const remaining = Math.floor((endTime - now) / 1000);
      
      if (remaining > 0) {
        setTimeLeft(remaining);
      } else {
        setIsActive(false);
      }
    } else {
      const endTime = Date.now() + (15 * 60 * 1000);
      localStorage.setItem('cartCountdownEnd', endTime.toString());
    }
  }, []);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      setIsActive(false);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  if (!isActive) return null;

  return (
    <div className="bg-gradient-to-r from-[#FFCC00] to-[#9A1900] text-white py-3 px-4 rounded-lg mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full">
            <i className="ri-time-line text-2xl"></i>
          </div>
          <div>
            <p className="font-semibold">Complete your order soon!</p>
            <p className="text-sm text-white/90">Items are reserved for limited time</p>
          </div>
        </div>
        <div className="text-center bg-white/20 rounded-lg px-4 py-2">
          <div className="text-2xl font-bold tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <div className="text-xs text-white/90">Time Left</div>
        </div>
      </div>
    </div>
  );
}
