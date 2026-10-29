// src/theme/responsive.js
// Système de mise en page réactive (breakpoints & dimensions dynamiques)

import { useWindowDimensions } from 'react-native';

const BREAKPOINTS = {
  smallPhone: 380,
  phone: 600,
  tablet: 1024,
};

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmall = width < BREAKPOINTS.smallPhone;
  const isTablet = width >= BREAKPOINTS.phone && width < BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.tablet;
  const isLandscape = width > height;

  // Nombre de colonnes pour les boutons d'actions rapides (Dashboard)
  let dashboardActionCols = 3;
  if (isSmall) {
    dashboardActionCols = 2;
  } else if (isTablet || isDesktop) {
    dashboardActionCols = width >= 800 ? 6 : 4;
  }

  // Nombre de colonnes pour les cartes de statistiques
  let statCols = 3;
  if (isSmall) {
    statCols = 1;
  } else if (width >= 600) {
    statCols = 3;
  }

  // Padding horizontal adaptatif
  const horizontalPadding = isSmall ? 12 : isTablet ? 24 : isDesktop ? 32 : 16;

  return {
    height,
    isSmall,
    isTablet,
    isDesktop,
    isLandscape,
    dashboardActionCols,
    statCols,
    horizontalPadding,
  };
}
