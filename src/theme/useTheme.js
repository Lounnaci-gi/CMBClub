// src/theme/useTheme.js
import { useMemo } from 'react';
import useStore from '../store/useStore';
import { getShadows, getThemeColors, RADIUS } from './themes';

export default function useTheme() {
  const themeId = useStore(s => s.themeId);
  const setTheme = useStore(s => s.setTheme);
  const colors = useMemo(() => getThemeColors(themeId), [themeId]);
  const shadows = useMemo(() => getShadows(colors), [colors]);

  return { colors, themeId, setTheme, RADIUS, shadows };
}

export { useResponsive } from './responsive';
