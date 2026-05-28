'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall } from './PWAInstaller';
import { LOGO_PATH } from '@/lib/site-config';

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export default function PWAPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [iosStep, setIosStep] = useState(0);
  const { canInstall, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    const showHandler = () => {
      setShowPrompt(true);
      setIosStep(0);
    };
    window.addEventListener('show-pwa-install-guide', showHandler);
    return () => window.removeEventListener('show-pwa-install-guide', showHandler);
  }, []);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isInStandaloneMode()) return;

    const ios = isIOS();
    setIsIOSDevice(ios);

    // Check dismissal cooldown (3 days instead of 7 for better conversion)
    const lastPromptTime = localStorage.getItem('pwaPromptTime');
    const daysSinceLastPrompt = lastPromptTime
      ? (Date.now() - parseInt(lastPromptTime)) / (1000 * 60 * 60 * 24)
      : 999;

    // Permanently dismissed
    const permanentDismiss = localStorage.getItem('pwaPromptDismissed');
    if (permanentDismiss === 'true') return;

    if (daysSinceLastPrompt < 3) return;

    if (ios) {
      // iOS: Show after 3 seconds of browsing (no beforeinstallprompt available)
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    } else if (canInstall) {
      // Android/Desktop: Show after 2 seconds when prompt is available
      const timer = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    if (isIOSDevice) {
      // iOS: step through the guide
      if (iosStep < 2) {
        setIosStep(iosStep + 1);
      } else {
        handleDismiss();
      }
    } else {
      const accepted = await install();
      if (accepted) setShowPrompt(false);
      localStorage.setItem('pwaPromptTime', Date.now().toString());
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwaPromptTime', Date.now().toString());
  };

  const handlePermanentDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwaPromptDismissed', 'true');
  };

  if (!showPrompt || isInstalled || isInStandaloneMode()) return null;
  // For non-iOS, only show when native prompt is available
  if (!isIOSDevice && !canInstall) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] pwa-prompt-backdrop"
        onClick={handleDismiss}
      />

      {/* Install Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] pwa-prompt-sheet">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.15)] overflow-hidden max-w-lg mx-auto">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="px-6 pb-8">
            {isIOSDevice ? (
              /* ============ iOS Install Guide ============ */
              <>
                {/* App icon and info */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-gray-100 flex items-center justify-center">
                    <img
                      src={LOGO_PATH}
                      alt="YOUR_BRAND_NAME"
                      className="w-10 h-10 object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg truncate">Install Our App</h3>
                    <p className="text-sm text-gray-500">Add to your home screen for the best experience</p>
                  </div>
                </div>

                {/* Step-by-step guide */}
                <div className="bg-gray-50 rounded-2xl p-5 mb-5">
                  <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">How to install</p>

                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className={`flex items-start gap-3 transition-opacity ${iosStep === 0 ? 'opacity-100' : 'opacity-50'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${iosStep === 0 ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {iosStep > 0 ? <i className="ri-check-line" /> : '1'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">Tap the Share button</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Tap the{' '}
                          <span className="inline-flex items-center bg-white border border-gray-200 rounded px-1.5 py-0.5 mx-0.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#AB9462]">
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                          </span>{' '}
                          icon at the bottom of Safari
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className={`flex items-start gap-3 transition-opacity ${iosStep === 1 ? 'opacity-100' : iosStep < 1 ? 'opacity-40' : 'opacity-50'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${iosStep === 1 ? 'bg-gray-900 text-white' : iosStep > 1 ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                        {iosStep > 1 ? <i className="ri-check-line" /> : '2'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">Scroll &amp; tap &quot;Add to Home Screen&quot;</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Scroll down in the share menu and tap{' '}
                          <span className="inline-flex items-center bg-white border border-gray-200 rounded px-1.5 py-0.5 mx-0.5 text-xs font-medium">
                            <i className="ri-add-box-line mr-1 text-gray-600" />
                            Add to Home Screen
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className={`flex items-start gap-3 transition-opacity ${iosStep === 2 ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${iosStep === 2 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        3
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">Tap &quot;Add&quot;</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Confirm by tapping <span className="font-semibold text-[#AB9462]">Add</span> in the top right corner
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={handleInstall}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 px-6 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] shadow-lg shadow-gray-900/20 flex items-center justify-center gap-2"
                >
                  {iosStep < 2 ? (
                    <>
                      Next Step
                      <i className="ri-arrow-right-line text-xl" />
                    </>
                  ) : (
                    <>
                      <i className="ri-check-line text-xl" />
                      Got it!
                    </>
                  )}
                </button>
              </>
            ) : (
              /* ============ Android/Desktop Native Install ============ */
              <>
                {/* App icon and info */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-gray-100 flex items-center justify-center">
                    <img
                      src={LOGO_PATH}
                      alt="YOUR_BRAND_NAME"
                      className="w-10 h-10 object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg truncate">YOUR_BRAND_NAME</h3>
                    <p className="text-sm text-gray-500">yourdomain.com</p>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <i key={star} className="ri-star-fill text-[#FFCC00] text-xs" />
                      ))}
                      <span className="text-xs text-gray-400 ml-1">Shopping</span>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { icon: 'ri-flashlight-line', label: 'Lightning Fast' },
                    { icon: 'ri-wifi-off-line', label: 'Works Offline' },
                    { icon: 'ri-notification-3-line', label: 'Get Notified' },
                  ].map((feature) => (
                    <div
                      key={feature.label}
                      className="bg-gray-50 rounded-xl p-3 text-center"
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <i className={`${feature.icon} text-gray-900 text-lg`} />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{feature.label}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={handleInstall}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 px-6 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] shadow-lg shadow-gray-900/20 flex items-center justify-center gap-2"
                >
                  <i className="ri-download-2-line text-xl" />
                  Add to Home Screen
                </button>
              </>
            )}

            {/* Dismiss buttons */}
            <button
              onClick={handleDismiss}
              className="w-full mt-3 py-3 text-gray-500 font-medium text-sm hover:text-gray-700 transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={handlePermanentDismiss}
              className="w-full py-1 text-gray-400 text-xs hover:text-gray-500 transition-colors"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
