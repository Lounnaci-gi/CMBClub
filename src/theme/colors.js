// src/theme/colors.js
// Compatibilité – préférer useTheme() pour les couleurs dynamiques

export { RADIUS, getShadows, getThemeColors, THEMES, THEME_IDS, THEME_OPTIONS } from './themes';
export { default as useTheme, useThemedStyles } from './useTheme';

import { getShadows, getThemeColors, RADIUS, THEME_IDS } from './themes';

export const COLORS = getThemeColors(THEME_IDS.DARK);
export const SHADOWS = getShadows(COLORS);

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};
