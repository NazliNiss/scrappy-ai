'use client';

import { useId } from 'react';

export function GooglePlayLogo({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <path fill="#EA4335" d="M3 20.5V3.5c0-.59.34-1.11.84-1.35l9.85 9.85L3.84 21.85A1.5 1.5 0 0 1 3 20.5Z" />
      <path fill="#FBBC04" d="m16.81 15.12-10.76 6.22 8.49-8.49 2.27 2.27Z" />
      <path fill="#4285F4" d="M20.16 10.81c.34.27.59.69.59 1.19s-.22.92-.57 1.2l-2.29 1.32-2.5-2.5 2.5-2.5 2.29 1.32Z" />
      <path fill="#34A853" d="M3.84 2.15A1.5 1.5 0 0 1 6.05 2.66l10.76 6.22-2.27 2.27L3.84 2.15Z" />
    </svg>
  );
}

export function AppStoreLogo({ size = 14, className = '' }) {
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <rect width="24" height="24" rx="5.5" fill={`url(#${gradientId})`} />
      <path
        fill="#fff"
        d="M16.5 16.25c-.28.64-.62 1.22-1.02 1.74-.54.7-1.04 1.05-1.5 1.05-.4 0-.98-.25-1.74-.25-.82 0-1.42.26-1.8.26-.68 0-1.24-.63-1.68-1.26-1.44-2.12-2.52-6.03-1.06-8.66.73-1.32 2.03-2.16 3.45-2.18.68-.01 1.32.45 1.77.45.43 0 1.24-.55 2.1-.47.36.01 1.37.15 2.02 1.13-.05.03-1.21.71-1.2 2.12.03 1.68 1.47 2.24 1.49 2.25-.01.04-.23.8-.76 1.58ZM13.28 5.5c.38-.46.64-1.1.57-1.74-.55.02-1.22.37-1.62.83-.35.4-.66 1.05-.58 1.67.61.05 1.24-.31 1.63-.76Z"
      />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1AC8FC" />
          <stop offset="1" stopColor="#1D70F2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function StoreLogo({ platform, size = 14, className = '' }) {
  if (platform === 'ios') {
    return <AppStoreLogo size={size} className={className} />;
  }
  return <GooglePlayLogo size={size} className={className} />;
}
