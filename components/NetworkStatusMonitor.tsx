'use client';

import { useState, useEffect } from 'react';

export default function NetworkStatusMonitor() {
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    if (connection) {
      const updateNetworkInfo = () => {
        const info = {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData
        };
        
        setNetworkInfo(info);
        setIsSlowConnection(
          connection.effectiveType === 'slow-2g' || 
          connection.effectiveType === '2g' || 
          connection.saveData
        );
      };

      updateNetworkInfo();
      connection.addEventListener('change', updateNetworkInfo);

      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    }
  }, []);

  if (!isSlowConnection) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] bg-[#FFCC00] text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 animate-slide-down">
      <i className="ri-signal-wifi-1-line text-xl"></i>
      <span className="font-medium whitespace-nowrap">
        Slow Connection Detected
      </span>
      <button 
        onClick={() => setIsSlowConnection(false)}
        className="w-6 h-6 flex items-center justify-center hover:bg-[#AB9462] rounded-full transition-colors"
      >
        <i className="ri-close-line"></i>
      </button>
    </div>
  );
}