'use client';

interface FreeShippingBarProps {
  currentAmount: number;
  threshold?: number;
}

export default function FreeShippingBar({ currentAmount, threshold = 200 }: FreeShippingBarProps) {
  const remaining = threshold - currentAmount;
  const percentage = Math.min((currentAmount / threshold) * 100, 100);
  const isQualified = currentAmount >= threshold;

  return (
    <div className={`rounded-lg p-4 mb-4 ${
      isQualified 
        ? 'bg-gradient-to-r from-gray-700 to-gray-800 text-white' 
        : 'bg-gradient-to-r from-[#FFFFCC]/50 to-[#F3F3F3] border-2 border-[#FFCC00]/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 flex items-center justify-center rounded-full ${
            isQualified ? 'bg-white/20' : 'bg-[#FFCC00]'
          }`}>
            <i className={`ri-truck-line text-lg ${isQualified ? 'text-white' : 'text-white'}`}></i>
          </div>
          <span className={`font-semibold ${isQualified ? 'text-white' : 'text-gray-900'}`}>
            {isQualified ? (
              <>🎉 You've qualified for FREE shipping!</>
            ) : (
              <>Add GH₵{remaining.toFixed(2)} more for FREE shipping</>
            )}
          </span>
        </div>
        {!isQualified && (
          <span className="text-sm font-bold text-[#AB9462]">
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>

      <div className="relative">
        <div className={`w-full h-3 rounded-full overflow-hidden ${
          isQualified ? 'bg-white/20' : 'bg-gray-200'
        }`}>
          <div
            className={`h-full transition-all duration-500 ${
              isQualified 
                ? 'bg-white' 
                : 'bg-gradient-to-r from-[#FFCC00] to-[#AB9462]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        {isQualified && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-1">
            <div className="w-6 h-6 flex items-center justify-center bg-white rounded-full text-gray-800">
              <i className="ri-check-line text-lg font-bold"></i>
            </div>
          </div>
        )}
      </div>

      {isQualified && (
        <p className="text-xs text-white/90 mt-2">
          Your order qualifies for free standard shipping!
        </p>
      )}
    </div>
  );
}
