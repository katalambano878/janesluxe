'use client';

import { useState } from 'react';

interface SocialShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

export default function SocialShareButtons({ url, title, description, image }: SocialShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}${image ? `&media=${encodeURIComponent(image)}` : ''}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    reddit: `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description || title + '\n\n' + url)}`
  };

  const handleShare = (platform: keyof typeof shareLinks) => {
    const link = shareLinks[platform];
    if (platform === 'email') {
      window.location.href = link;
    } else {
      window.open(link, '_blank', 'width=600,height=400');
    }
    setShowShareMenu(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowShareMenu(!showShareMenu)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-600 hover:bg-gray-100 transition-colors"
      >
        <i className="ri-share-line text-lg"></i>
        <span className="font-medium">Share</span>
      </button>

      {showShareMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowShareMenu(false)}
          ></div>
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Share this product</h3>
            </div>

            <div className="p-4 grid grid-cols-4 gap-3">
              <button
                onClick={() => handleShare('facebook')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#AB9462]/5 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#2C1D00] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-facebook-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Facebook</span>
              </button>

              <button
                onClick={() => handleShare('twitter')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#AB9462]/5 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#2C1D00] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-twitter-x-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Twitter</span>
              </button>

              <button
                onClick={() => handleShare('pinterest')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#FFCCCC]/50 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#9A1900] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-pinterest-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Pinterest</span>
              </button>

              <button
                onClick={() => handleShare('whatsapp')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-gray-700 text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-whatsapp-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">WhatsApp</span>
              </button>

              <button
                onClick={() => handleShare('telegram')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#AB9462]/5 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#2C1D00] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-telegram-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Telegram</span>
              </button>

              <button
                onClick={() => handleShare('linkedin')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#AB9462]/5 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#2C1D00] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-linkedin-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">LinkedIn</span>
              </button>

              <button
                onClick={() => handleShare('reddit')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-[#FFFFCC]/50 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[#FFCC00] text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-reddit-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Reddit</span>
              </button>

              <button
                onClick={() => handleShare('email')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-gray-600 text-white rounded-full group-hover:scale-110 transition-transform">
                  <i className="ri-mail-fill text-xl"></i>
                </div>
                <span className="text-xs text-gray-600">Email</span>
              </button>
            </div>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={url}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <i className="ri-check-line"></i> Copied
                    </>
                  ) : (
                    <>
                      <i className="ri-file-copy-line"></i> Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}