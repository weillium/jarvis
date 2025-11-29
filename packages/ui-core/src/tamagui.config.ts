// @ts-nocheck
import { createAnimations } from '@tamagui/animations-react-native';
import { config as defaultConfig } from '@tamagui/config/v3';
import { createInterFont } from '@tamagui/font-inter';
import { createMedia } from '@tamagui/react-native-media-driver';
import { createTamagui } from 'tamagui';

// Base font from Tamagui - we'll extend it with our custom sizes
const baseInterFont = createInterFont();

// Define size tokens based on standard Tamagui v3 config values
// These correspond to size tokens $3, $4, $5 in the default config
const sizeTokenSm = 13; // $3
const sizeTokenMd = 14; // $4
const sizeTokenLg = 16; // $5

// Calculate proper line heights (typically 1.5x font size for readability)
const lineHeightSm = Math.round(sizeTokenSm * 1.5);
const lineHeightMd = Math.round(sizeTokenMd * 1.5);
const lineHeightLg = Math.round(sizeTokenLg * 1.5);

// Create font with proper size and lineHeight mappings
// IMPORTANT: Font size values in interFont.size MUST be numeric values, not token references
// When using font="$body" with size="sm|md|lg", Tamagui looks up interFont.size.sm/md/lg
// and expects concrete numeric values (e.g., 13, 14, 16), NOT token strings like '$sm'
// 
// The spread of baseInterFont.size preserves all numeric keys (0, 1, 2, 3, etc.)
// and we override/add sm, md, lg with our numeric values
const interFont = createInterFont({
  size: {
    // Spread base sizes to preserve numeric keys (0, 1, 2, 3, 4, 5, etc.)
    // These are used when fontSize="$1", fontSize="$2", etc.
    ...baseInterFont.size,
    // Add string keys sm, md, lg with NUMERIC values (not '$sm', '$md', '$lg')
    // These are used when font="$body" with size="sm|md|lg"
    sm: sizeTokenSm,  // 13 - numeric value
    md: sizeTokenMd,  // 14 - numeric value
    lg: sizeTokenLg,  // 16 - numeric value
  },
  lineHeight: {
    // Spread base line heights to preserve numeric keys
    ...baseInterFont.lineHeight,
    // Add string keys with NUMERIC line height values
    sm: lineHeightSm,  // 20 - numeric value (1.5 * 13)
    md: lineHeightMd,  // 21 - numeric value (1.5 * 14)
    lg: lineHeightLg,  // 24 - numeric value (1.5 * 16)
  },
});

const animations = createAnimations({
  bouncy: {
    type: 'spring',
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  lazy: {
    type: 'spring',
    damping: 20,
    stiffness: 60,
  },
  quick: {
    type: 'spring',
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
});

// Extend the base config with custom theme tokens
// Matching current design system colors
const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  defaultTheme: 'dark',
  shouldAddPrefersColorThemes: false,
  themeClassNameOnRoot: false,
  media: createMedia({
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    xxl: { maxWidth: 1600 },
    gtXs: { minWidth: 660 + 1 },
    gtSm: { minWidth: 800 + 1 },
    gtMd: { minWidth: 1020 + 1 },
    gtLg: { minWidth: 1280 + 1 },
    short: { maxHeight: 820 },
    tall: { minHeight: 820 },
    hoverNone: { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  }),
  fonts: {
    ...defaultConfig.fonts,
    body: interFont,
    heading: interFont,
  },
  themes: {
    ...defaultConfig.themes,
    light: {
      ...defaultConfig.themes.light,
      // Match current design system
      background: '#ffffff',
      backgroundHover: '#f8fafc',
      backgroundPress: '#f1f5f9',
      backgroundFocus: '#e2e8f0',
      color: '#0f172a',
      colorHover: '#1e293b',
      colorPress: '#334155',
      colorFocus: '#475569',
      borderColor: '#e2e8f0',
      borderColorHover: '#cbd5e1',
      placeholderColor: '#94a3b8',
      // Primary colors
      blue1: '#eff6ff',
      blue2: '#dbeafe',
      blue3: '#bfdbfe',
      blue4: '#93c5fd',
      blue5: '#60a5fa',
      blue6: '#3b82f6',
      blue7: '#2563eb',
      blue8: '#1d4ed8',
      blue9: '#1e40af',
      blue10: '#1e3a8a',
      blue11: '#1e293b',
      blue12: '#0f172a',
      // Status colors
      green1: '#f0fdf4',
      green2: '#dcfce7',
      green3: '#bbf7d0',
      green4: '#86efac',
      green5: '#4ade80',
      green6: '#22c55e',
      green7: '#16a34a',
      green8: '#15803d',
      green9: '#166534',
      green10: '#14532d',
      green11: '#10b981',
      green12: '#059669',
      // Warning colors
      yellow1: '#fefce8',
      yellow2: '#fef9c3',
      yellow3: '#fef08a',
      yellow4: '#fde047',
      yellow5: '#facc15',
      yellow6: '#eab308',
      yellow7: '#ca8a04',
      yellow8: '#a16207',
      yellow9: '#854d0e',
      yellow10: '#713f12',
      yellow11: '#ca8a04',
      yellow12: '#a16207',
      // Error colors
      red1: '#fef2f2',
      red2: '#fee2e2',
      red3: '#fecaca',
      red4: '#fca5a5',
      red5: '#f87171',
      red6: '#ef4444',
      red7: '#dc2626',
      red8: '#b91c1c',
      red9: '#991b1b',
      red10: '#7f1d1d',
      red11: '#dc2626',
      red12: '#991b1b',
      // Gray scale
      gray1: '#f8fafc',
      gray2: '#f1f5f9',
      gray3: '#e2e8f0',
      gray4: '#cbd5e1',
      gray5: '#94a3b8',
      gray6: '#64748b',
      gray7: '#475569',
      gray8: '#334155',
      gray9: '#1e293b',
      gray10: '#0f172a',
      gray11: '#64748b',
      gray12: '#475569',
      // Purple colors (for paused status)
      purple1: '#faf5ff',
      purple2: '#f3e8ff',
      purple3: '#e9d5ff',
      purple4: '#d8b4fe',
      purple5: '#c084fc',
      purple6: '#a855f7',
      purple7: '#9333ea',
      purple8: '#7e22ce',
      purple9: '#6b21a8',
      purple10: '#581c87',
      purple11: '#8b5cf6',
      purple12: '#6b21a8',
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: '#0a0a0a',
      backgroundHover: '#171717',
      backgroundPress: '#262626',
      backgroundFocus: '#404040',
      color: '#ededed',
      colorHover: '#f5f5f5',
      colorPress: '#ffffff',
      colorFocus: '#fafafa',
      borderColor: '#262626',
      borderColorHover: '#404040',
      placeholderColor: '#737373',
    },
  },
  tokens: {
    ...defaultConfig.tokens,
    // Size tokens for typography, including named variants
    // These must match the font size definitions above
    size: {
      ...defaultConfig.tokens.size,
      sm: sizeTokenSm,
      md: sizeTokenMd,
      lg: sizeTokenLg,
    },
    // Line height tokens for consistent typography
    // Note: lineHeight may not exist in defaultConfig.tokens, so we create it
    lineHeight: {
      ...('lineHeight' in defaultConfig.tokens && defaultConfig.tokens.lineHeight ? defaultConfig.tokens.lineHeight : {}),
      sm: lineHeightSm,
      md: lineHeightMd,
      lg: lineHeightLg,
    },
    // Custom spacing to match current design while keeping Tamagui tokens
    space: {
      ...defaultConfig.tokens.space,
      0: 0,
      0.25: 1,
      0.5: 2,
      0.75: 3,
      1: 4,
      1.5: 6,
      2: 8,
      2.5: 10,
      3: 12,
      3.5: 14,
      4: 16,
      4.5: 18,
      5: 20,
      5.5: 22,
      6: 24,
      6.5: 26,
      7: 28,
      7.5: 30,
      8: 32,
      8.5: 34,
      9: 36,
      9.5: 38,
      10: 40,
      10.5: 42,
      11: 44,
      11.5: 46,
      12: 48,
    },
    // Custom radius to cover all usages across apps
    radius: {
      ...defaultConfig.tokens.radius,
      0: 0,
      1: 3,
      2: 6,
      2.5: 8,
      3: 9,
      4: 12,
      5: 16,
      6: 20,
      7: 24,
      8: 28,
      9: 32,
      10: 40,
    },
  },
});

export default tamaguiConfig;

// TypeScript type helper
export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends Conf {}
}
