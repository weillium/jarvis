import { createTamagui } from 'tamagui';
import { config as defaultConfig } from '@tamagui/config/v3';
import { createInterFont } from '@tamagui/font-inter';

// Create Inter font
const interFont = createInterFont();

// Extend the base config with custom theme tokens
// Matching current design system colors
const tamaguiConfig = createTamagui({
  ...defaultConfig,
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
    // Custom spacing to match current design
    space: {
      ...defaultConfig.tokens.space,
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      7: 28,
      8: 32,
      9: 36,
      10: 40,
      11: 44,
      12: 48,
    },
    // Custom radius
    radius: {
      ...defaultConfig.tokens.radius,
      0: 0,
      1: 3,
      2: 6,
      3: 9,
      4: 12,
      5: 16,
      6: 20,
    },
  },
});

export default tamaguiConfig;

// TypeScript type helper
export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

