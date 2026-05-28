'use client';

import { useState, useEffect } from 'react';

interface FlashSale {
  title: string;
  discount: number;
  endTime: Date;
  ctaText: string;
  ctaLink: string;
}

export default function FlashSaleBanner() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isVisible, setIsVisible] = useState(true);

  const flashSale: FlashSale = {
    title: 'Flash Sale',
    discount: 30,
    endTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    ctaText: 'Shop Now',
    ctaLink: '/shop'
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = flashSale.endTime.getTime() - now;

      if (distance < 0) {
        clearInterval(timer);
        setIsVisible(false);
        return;
      }

      setTimeLeft({
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
    }, 1000);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- flashSale.endTime is stable for timer setup
  }, []);

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-[#9A1900] via-[#FF6666] to-[#FFCC00] text-white py-3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <i className="ri-flashlight-fill text-2xl animate-pulse"></i>
              <span className="font-bold text-lg">{flashSale.title}</span>
            </div>
            <span className="text-lg">
              Up to <span className="font-bold text-2xl">{flashSale.discount}% OFF</span>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">Ends in:</span>
              <div className="flex space-x-2">
                <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg">
                  <span className="font-bold text-xl">{String(timeLeft.hours).padStart(2, '0')}</span>
                  <span className="text-xs block">Hours</span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg">
                  <span className="font-bold text-xl">{String(timeLeft.minutes).padStart(2, '0')}</span>
                  <span className="text-xs block">Min</span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg">
                  <span className="font-bold text-xl">{String(timeLeft.seconds).padStart(2, '0')}</span>
                  <span className="text-xs block">Sec</span>
                </div>
              </div>
            </div>

            <a
              href={flashSale.ctaLink}
              className="bg-white text-[#9A1900] px-6 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              {flashSale.ctaText}
            </a>
          </div>

          <button
            onClick={() => setIsVisible(false)}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
