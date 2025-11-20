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

