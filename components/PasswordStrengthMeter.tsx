'use client';

import { useEffect, useState } from 'react';

interface PasswordStrengthMeterProps {
  password: string;
}

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState(0);
  const [feedback, setFeedback] = useState<string[]>([]);

  useEffect(() => {
    if (!password) {
      setStrength(0);
      setFeedback([]);
      return;
    }

    let score = 0;
    const issues: string[] = [];

    if (password.length >= 8) {
      score += 20;
    } else {
      issues.push('At least 8 characters');
    }

    if (password.length >= 12) {
      score += 10;
    }

    if (/[a-z]/.test(password)) {
      score += 20;
    } else {
      issues.push('Add lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 20;
    } else {
      issues.push('Add uppercase letters');
    }

    if (/[0-9]/.test(password)) {
      score += 15;
    } else {
      issues.push('Add numbers');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score += 15;
    } else {
      issues.push('Add special characters (!@#$%^&*)');
    }

    setStrength(score);
    setFeedback(issues);
  }, [password]);

  const getStrengthText = () => {
    if (strength === 0) return '';
    if (strength < 40) return 'Weak';
    if (strength < 70) return 'Fair';
    if (strength < 90) return 'Good';
    return 'Strong';
  };

  const getStrengthColor = () => {
    if (strength < 40) return 'bg-[#FF6666]';
    if (strength < 70) return 'bg-[#FFCC00]';
    if (strength < 90) return 'bg-[#FFCC00]';
    return 'bg-gray-700';
  };

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getStrengthColor()}`}
            style={{ width: `${strength}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${
          strength < 40 ? 'text-[#9A1900]' :
          strength < 70 ? 'text-[#AB9462]' :
          strength < 90 ? 'text-[#AB9462]' :
          'text-gray-700'
        }`}>
          {getStrengthText()}
        </span>
      </div>

      {feedback.length > 0 && (
        <div className="space-y-1">
          {feedback.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5 text-xs text-gray-600">
              <i className="ri-close-circle-line text-[#FF6666] w-3 h-3 flex items-center justify-center"></i>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {strength >= 90 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-700">
          <i className="ri-checkbox-circle-fill w-3 h-3 flex items-center justify-center"></i>
          <span>Your password is strong and secure!</span>
        </div>
      )}
    </div>
  );
}
