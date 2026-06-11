'use client';

import { Suspense, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import ScrollToTop from '@/components/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import NavigationProgress from '@/components/NavigationProgress';
import PWASplash from '@/components/PWASplash';
import PWAInstaller from '@/components/PWAInstaller';
import PWAPrompt from '@/components/PWAPrompt';
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning';
import OfflineIndicator from '@/components/OfflineIndicator';
import NetworkStatusMonitor from '@/components/NetworkStatusMonitor';
import UpdatePrompt from '@/components/UpdatePrompt';
import LiveSalesNotification from '@/components/LiveSalesNotification';
import ChatWidget from '@/components/ChatWidget';

import { CMSProvider } from '@/context/CMSContext';
import { BranchProvider } from '@/context/BranchContext';
import BranchSelectorModal from '@/components/BranchSelectorModal';

// Feature flag: control chat widget via env
const CHAT_ENABLED =
  typeof process.env.NEXT_PUBLIC_CHAT_ENABLED === 'undefined' ||
  process.env.NEXT_PUBLIC_CHAT_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_CHAT_ENABLED === '1';

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [chatModuleEnabled, setChatModuleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchModules() {
      try {
        const res = await fetch('/api/storefront/modules', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!isMounted) return;

        if (!res.ok) {
          setChatModuleEnabled(false);
          return;
        }

        const data: { id: string; enabled: boolean }[] = await res.json();
        const aiChat = data.find(m => m.id === 'ai-chat');
        setChatModuleEnabled(!!aiChat?.enabled);
      } catch {
        if (isMounted) {
          setChatModuleEnabled(false);
        }
      }
    }

    fetchModules();

    return () => {
      isMounted = false;
    };
  }, []);

  // Only show chat when env allows AND the module is explicitly enabled in DB (Modules page)
  const shouldShowChat = CHAT_ENABLED && chatModuleEnabled === true;

  return (
    <CMSProvider>
      <BranchProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <ScrollToTop />
      <div className="min-h-screen bg-brand-ivory">
        <PWASplash />
        <PWAInstaller />
        <Header />
        <BranchSelectorModal />
        <ErrorBoundary>
          <div className="pwa-page-enter">
            {children}
          </div>
        </ErrorBoundary>
        <Footer />
        <MobileBottomNav />
        <SessionTimeoutWarning />
        <PWAPrompt />

        <OfflineIndicator />
        <NetworkStatusMonitor />
        <UpdatePrompt />
        <LiveSalesNotification />

        {shouldShowChat && <ChatWidget />}
      </div>
      </BranchProvider>
    </CMSProvider>
  );
}
