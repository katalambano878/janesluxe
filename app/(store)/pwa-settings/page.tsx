'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PWASettingsPage() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0 });
  const [cacheSize, setCacheSize] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        setStorageUsage({
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        });
      });
    }

    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        Promise.all(
          cacheNames.map((cacheName) =>
            caches.open(cacheName).then((cache) =>
              cache.keys().then((keys) => keys.length)
            )
          )
        ).then((counts) => {
          setCacheSize(counts.reduce((a, b) => a + b, 0));
        });
      });
    }
  }, []);

  const clearCache = async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      setCacheSize(0);
      alert('Cache cleared successfully!');
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-900 hover:text-gray-800 mb-6 whitespace-nowrap"
        >
          <i className="ri-arrow-left-line"></i>
          Back to Home
        </Link>

        <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">PWA Settings</h1>
          <p className="text-gray-600">Manage your app installation and preferences</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#AB9462]/10 rounded-full flex items-center justify-center">
                <i className="ri-smartphone-line text-[#AB9462]"></i>
              </div>
              Installation Status
            </h2>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="font-semibold text-gray-900 mb-1">App Installed</p>
                <p className="text-sm text-gray-600">
                  {isInstalled ? 'App is installed on this device' : 'App is not installed'}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isInstalled ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
              }`}>
                <i className={isInstalled ? 'ri-check-line text-2xl' : 'ri-close-line text-2xl'}></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#AB9462]/10 rounded-full flex items-center justify-center">
                <i className="ri-notification-line text-[#AB9462]"></i>
              </div>
              Notifications
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Push Notifications</p>
                  <p className="text-sm text-gray-600">
                    Status: <span className="font-medium capitalize">{notificationPermission}</span>
                  </p>
                </div>
                {notificationPermission === 'default' && (
                  <button
                    onClick={requestNotificationPermission}
                    className="px-4 py-2 bg-[#2C1D00] text-white rounded-lg hover:bg-[#2C1D00]/90 transition-colors whitespace-nowrap"
                  >
                    Enable
                  </button>
                )}
                {notificationPermission === 'granted' && (
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <i className="ri-check-line text-gray-700 text-2xl"></i>
                  </div>
                )}
                {notificationPermission === 'denied' && (
                  <div className="w-12 h-12 bg-[#FFCCCC] rounded-full flex items-center justify-center">
                    <i className="ri-close-line text-[#9A1900] text-2xl"></i>
                  </div>
                )}
              </div>

              {notificationPermission === 'granted' && (
                <div className="bg-[#AB9462]/10 border border-[#AB9462]/20 rounded-xl p-4">
                  <p className="text-sm text-[#AB9462] font-medium mb-2">You will receive notifications for:</p>
                  <ul className="space-y-1 text-sm text-[#AB9462]/80">
                    <li className="flex items-center gap-2">
                      <i className="ri-check-line"></i>
                      <span>Order confirmations and updates</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <i className="ri-check-line"></i>
                      <span>Flash sales and exclusive deals</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <i className="ri-check-line"></i>
                      <span>Wishlist price drops</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <i className="ri-check-line"></i>
                      <span>Back in stock alerts</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FFFFCC] rounded-full flex items-center justify-center">
                <i className="ri-database-line text-[#AB9462]"></i>
              </div>
              Storage & Cache
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">Storage Usage</p>
                  <span className="text-sm text-gray-600">
                    {formatBytes(storageUsage.used)} of {formatBytes(storageUsage.quota)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#AB9462] h-full rounded-full transition-all"
                    style={{ width: `${(storageUsage.used / storageUsage.quota) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Cached Items</p>
                  <p className="text-sm text-gray-600">{cacheSize} items stored locally</p>
                </div>
                <button
                  onClick={clearCache}
                  className="px-4 py-2 bg-[#9A1900] text-white rounded-lg hover:bg-[#9A1900]/90 transition-colors whitespace-nowrap"
                >
                  Clear Cache
                </button>
              </div>

              <div className="bg-[#FFFFCC] border border-[#FFCC00]/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-[#996633] text-xl"></i>
                  <div className="text-sm text-[#996633]">
                    <p className="font-medium mb-1">About Cache</p>
                    <p>Cached data helps the app load faster and work offline. Clearing cache will remove offline access temporarily.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <i className="ri-flashlight-line text-gray-700"></i>
              </div>
              PWA Features
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <i className="ri-wifi-off-line text-gray-700 text-xl"></i>
                  <span className="font-semibold text-gray-900">Offline Mode</span>
                </div>
                <p className="text-sm text-gray-800">Browse cached pages without internet</p>
              </div>
              <div className="p-4 bg-[#AB9462]/10 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <i className="ri-rocket-line text-[#AB9462] text-xl"></i>
                  <span className="font-semibold text-[#AB9462]">Fast Loading</span>
                </div>
                <p className="text-sm text-[#AB9462]/80">Instant page loads with smart caching</p>
              </div>
              <div className="p-4 bg-[#AB9462]/10 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <i className="ri-home-line text-[#AB9462] text-xl"></i>
                  <span className="font-semibold text-[#AB9462]">Home Screen</span>
                </div>
                <p className="text-sm text-[#AB9462]/80">Add to home screen like a native app</p>
              </div>
              <div className="p-4 bg-[#FFFFCC]/50 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <i className="ri-refresh-line text-[#AB9462] text-xl"></i>
                  <span className="font-semibold text-[#996633]">Auto Updates</span>
                </div>
                <p className="text-sm text-[#996633]/80">Automatic updates in the background</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}