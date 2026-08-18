import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import React, { useEffect, useState, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, StatusBar, Image, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDatabase } from './src/database/database';
import AppNavigator from './src/navigation/AppNavigator';
import useStore from './src/store/useStore';
import useTheme from './src/theme/useTheme';
import { THEME_IDS } from './src/theme/themes';

LogBox.ignoreLogs([
  'Cloudflare',
  'Unable to resolve host',
  'fetch failed',
]);

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const loadConfig = useStore(s => s.loadConfig);
  const restoreSession = useStore(s => s.restoreSession);
  const { colors: COLORS, RADIUS, shadows: SHADOWS, themeId } = useTheme();
  const statusBarStyle = themeId === THEME_IDS.LIGHT ? 'dark-content' : 'light-content';
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await loadConfig();
        await restoreSession();
        setReady(true);
      } catch (e) {
        setError(e.message || 'Erreur d\'initialisation');
      }
    })();
  }, [loadConfig, restoreSession]);

  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle={statusBarStyle} />
        <Text style={styles.errorTitle}>Erreur</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle={statusBarStyle} />
        <Image
          source={require('./assets/cmbclub.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Initialisation CMBClub…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle={statusBarStyle} />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 8,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  errorTitle: {
    color: COLORS.danger,
    fontSize: 20,
    fontWeight: '700',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
