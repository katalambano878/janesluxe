'use client';

import { useEffect, useState } from 'react';

export default function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const IDLE_TIMEOUT = 25 * 60 * 1000;
  const WARNING_TIME = 60 * 1000;

  useEffect(() => {
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    const resetTimer = () => {
      setLastActivity(Date.now());
      setShowWarning(false);
      setCountdown(60);
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    const checkInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      
      if (timeSinceActivity >= IDLE_TIMEOUT) {
        handleLogout();
      } else if (timeSinceActivity >= IDLE_TIMEOUT - WARNING_TIME) {
        setShowWarning(true);
        const remaining = Math.ceil((IDLE_TIMEOUT - timeSinceActivity) / 1000);
        setCountdown(remaining);
      }
    }, 1000);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      clearInterval(checkInterval);
    };
  }, [lastActivity, IDLE_TIMEOUT, WARNING_TIME]);

  const handleLogout = () => {
    localStorage.setItem('session_expired', 'true');
    window.location.href = '/auth/login';
  };

  const handleStayLoggedIn = () => {
    setLastActivity(Date.now());
    setShowWarning(false);
    setCountdown(60);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-[#FFFFCC] rounded-full flex items-center justify-center">
            <i className="ri-time-line text-2xl text-[#AB9462]"></i>
          </div>
          <div>
            <h3 className="font-bold text-lg">Session Timeout Warning</h3>
            <p className="text-sm text-gray-600">Your session is about to expire</p>
          </div>
        </div>

        <div className="bg-[#FFFFCC]/50 border border-[#FFCC00]/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-2">
            You will be automatically logged out in:
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[#FFCC00]/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FFCC00] transition-all duration-1000"
                style={{ width: `${(countdown / 60) * 100}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-[#AB9462] tabular-nums">
              {countdown}s
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium whitespace-nowrap"
          >
            Logout Now
          </button>
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium whitespace-nowrap"
          >
            Stay Logged In
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          For your security, sessions expire after 25 minutes of inactivity
        </p>
      </div>
    </div>
  );
}
