'use client';

import type { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
}

const createIcon = (
  paths: React.ReactNode,
  defaultViewBox = '0 0 24 24'
) => {
  const Icon = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
    <svg
      {...(props as any)}
      width={size}
      height={size}
      viewBox={defaultViewBox}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths}
    </svg>
  );
  return Icon;
};

export const FilePdfIcon = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M10 12h4" />
    <path d="M10 16h4" />
    <path d="M10 8h4" />
  </>
);

export const FileDocumentIcon = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </>
);

export const FileImageIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </>
);

export const FileSpreadsheetIcon = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h8" />
    <path d="M8 9h8" />
  </>
);

export const FilePresentationIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </>
);

export const FileArchiveIcon = createIcon(
  <>
    <path d="M21 8v13H3V8" />
    <path d="M1 3h22v5H1z" />
    <path d="M10 12h4" />
  </>
);

export const FileGenericIcon = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>
);

export const DownloadIcon = (props: IconProps) =>
  createIcon(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  )(props);

export const RemoveIcon = (props: IconProps) =>
  createIcon(
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  )(props);

export const EyeIcon = (props: IconProps) =>
  createIcon(
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  )(props);

export const EyeOffIcon = (props: IconProps) =>
  createIcon(
    <>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.16 21.16 0 0 1 5.08-5.77" />
      <path d="M1 1l22 22" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M6.22 6.22A10.88 10.88 0 0 1 12 5c7 0 11 7 11 7a21.34 21.34 0 0 1-5.36 5.94" />
      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
    </>
  )(props);

export const CalendarIcon = (props: IconProps) =>
  createIcon(
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  )(props);

export const ClockIcon = (props: IconProps) =>
  createIcon(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  )(props);

