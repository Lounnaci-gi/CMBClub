// src/screens/auth/LoginScreen.js
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserByCredentials } from '../../database/database';
import useStore from '../../store/useStore';
import useTheme, { useResponsive } from '../../theme/useTheme';
import {
  validateLoginInput,
  isLoginLocked,
  getLockoutRemainingSeconds,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  getRemainingAttempts,
} from '../../utils/validation';

export default function LoginScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const { isSmall, isTablet, isDesktop, isLandscape, height } = useResponsive();
  const isShortScreen = height < 640;
  const styles = useMemo(
    () => createStyles(COLORS, RADIUS, SHADOWS, isSmall, isTablet || isDesktop, isShortScreen),
    [COLORS, RADIUS, SHADOWS, isSmall, isTablet, isDesktop, isShortScreen],
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockTimerRef = useRef(null);
  const setUser = useStore(s => s.setUser);

  // Mise à jour du compte à rebours quand l'écran est verrouillé
  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockTimerRef.current = setInterval(() => {
        const remaining = getLockoutRemainingSeconds();
        setLockoutSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(lockTimerRef.current);
          setError('');
        }
      }, 1000);
    }
    return () => clearInterval(lockTimerRef.current);
  }, [lockoutSeconds]);

  const handleLogin = async () => {
    setError('');

    // 1. Vérifier le verrouillage côté client
    if (isLoginLocked()) {
      const remaining = getLockoutRemainingSeconds();
      setLockoutSeconds(remaining);
      setError(`Trop de tentatives. Réessayez dans ${remaining}s.`);
      return;
    }

    // 2. Valider et sanitiser les entrées
    const validation = validateLoginInput(username, password);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setLoading(true);
    try {
      const user = await getUserByCredentials(validation.username, validation.password);
      if (!user) {
        recordFailedLoginAttempt();
        const remaining = getRemainingAttempts();
        if (isLoginLocked()) {
          const secs = getLockoutRemainingSeconds();
          setLockoutSeconds(secs);
          setError(`Trop de tentatives. Compte verrouillé pendant ${Math.ceil(secs / 60)} minute(s).`);
        } else {
          setError(
            remaining <= 2
              ? `Identifiants incorrects. ${remaining} tentative(s) restante(s) avant verrouillage.`
              : 'Identifiants incorrects.'
          );
        }
      } else {
        resetLoginAttempts();
        setUser(user);
      }
    } catch (e) {
      setError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockoutSeconds > 0;

  return (
    <LinearGradient colors={[COLORS.bg, '#0A1520', '#071018']} style={styles.gradient}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Logo & Brand */}
          <View style={styles.brand}>
            <View style={styles.logoRing}>
              <Image
                source={require('../../../assets/cmbclub.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>CMBClub</Text>
            <Text style={styles.tagline}>Gestion des adhésions sportives</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connexion</Text>

            <View style={[styles.inputWrapper, isLocked && styles.inputDisabled]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Identifiant"
                placeholderTextColor={COLORS.textMuted}
                value={username}
                onChangeText={t => { setUsername(t); setError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLocked}
                maxLength={64}
              />
            </View>

            <View style={[styles.inputWrapper, isLocked && styles.inputDisabled]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Mot de passe"
                placeholderTextColor={COLORS.textMuted}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
                secureTextEntry={!showPass}
                editable={!isLocked}
                maxLength={128}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                <MaterialCommunityIcons
                  name={showPass ? 'eye-off' : 'eye'}
                  size={20}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={[styles.errorBox, isLocked && styles.errorBoxLocked]}>
                <MaterialCommunityIcons
                  name={isLocked ? 'lock-clock' : 'alert-circle'}
                  size={15}
                  color={isLocked ? COLORS.warning || '#f59e0b' : COLORS.danger}
                />
                <Text style={[styles.errorText, isLocked && { color: COLORS.warning || '#f59e0b' }]}>{error}</Text>
              </View>
            ) : null}

            {isLocked && (
              <View style={styles.lockoutTimer}>
                <MaterialCommunityIcons name="timer-outline" size={16} color={COLORS.textMuted} />
                <Text style={styles.lockoutTimerText}>
                  Déverrouillage dans <Text style={styles.lockoutCountdown}>{lockoutSeconds}s</Text>
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.loginBtn, (loading || isLocked) && styles.loginBtnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loading || isLocked}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name={isLocked ? 'lock' : 'login'} size={20} color="#fff" />
                  <Text style={styles.loginText}>{isLocked ? 'Accès verrouillé' : 'Se connecter'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>CMBClub v1.0 · Système de Gestion</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS, isSmall, isLarge, isShort) => StyleSheet.create({
  gradient: { flex: 1 },
  keyboardView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: isSmall ? 16 : isLarge ? 32 : 24,
    paddingVertical: isShort ? 12 : 24,
    justifyContent: 'center',
    gap: isShort ? 12 : 20,
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: isShort ? 4 : 6 },
  logoRing: {
    width: isShort ? 72 : isSmall ? 84 : 96,
    height: isShort ? 72 : isSmall ? 84 : 96,
    borderRadius: isShort ? 36 : isSmall ? 42 : 48,
    borderWidth: 2,
    borderColor: COLORS.primary + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  logo: {
    width: isShort ? 64 : isSmall ? 74 : 84,
    height: isShort ? 64 : isSmall ? 74 : 84,
    borderRadius: isShort ? 32 : isSmall ? 37 : 42,
    ...SHADOWS.card,
  },
  appName: {
    fontSize: isShort ? 28 : isSmall ? 30 : 34,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 2,
  },
  tagline: {
    color: COLORS.textSecondary,
    fontSize: isSmall ? 12 : 13,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: isSmall ? 18 : 24,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: isSmall ? 18 : 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: isSmall ? 11 : 13,
  },
  eyeBtn: { padding: 4 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
  },
  errorBoxLocked: {
    backgroundColor: '#f59e0b15',
    borderColor: '#f59e0b30',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    flex: 1,
  },
  lockoutTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  lockoutTimerText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  lockoutCountdown: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: isSmall ? 13 : 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...SHADOWS.button,
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  footer: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
