import type { CSSProperties } from 'react';

const VintageCar = (props: { size?: number; strokeWidth?: number; className?: string; style?: CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={props.strokeWidth || 1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={props.style}
    width={props.size || 24}
    height={props.size || 24}
  >
    <line x1="3" y1="17" x2="21" y2="17" />
    <rect x="3" y="11" width="3" height="6" rx="0.5" />
    <line x1="4.5" y1="11" x2="4.5" y2="17" />
    <circle cx="2.5" cy="11.5" r="1.2" />
    <line x1="3.5" y1="12" x2="2.5" y2="12" />
    <path d="M6 12.5h6v4.5H6z" />
    <line x1="12" y1="12.5" x2="13.5" y2="8" />
    <line x1="13" y1="11" x2="14.5" y2="11.5" />
    <circle cx="13.8" cy="11.2" r="0.8" />
    <path d="M12.5 7.5c2.5-1 5.5-1 7 1v4" />
    <line x1="19.5" y1="12.5" x2="15.5" y2="7" />
    <line x1="19.5" y1="12.5" x2="17.5" y2="6.8" />
    <line x1="19.5" y1="12.5" x2="19.5" y2="8.5" />
    <path d="M12.5 12.5h6.5v4.5h-6.5c-1 0-1.5-.5-1.5-1.5v-3" />
    <path d="M10.5 17.5c0-3.5-1.5-4.5-4.5-4.5" />
    <path d="M22 17.5c0-3.5-1.8-4.5-4.3-4.5" />
    <circle cx="8" cy="18.5" r="3.5" />
    <circle cx="8" cy="18.5" r="0.7" />
    <line x1="8" y1="15" x2="8" y2="22" />
    <line x1="4.5" y1="18.5" x2="11.5" y2="18.5" />
    <circle cx="18" cy="18.5" r="3.5" />
    <circle cx="18" cy="18.5" r="0.7" />
    <line x1="18" y1="15" x2="18" y2="22" />
    <line x1="14.5" y1="18.5" x2="21.5" y2="18.5" />
  </svg>
);

export default VintageCar;
