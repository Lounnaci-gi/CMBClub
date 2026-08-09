// src/screens/auth/LoginScreen.js
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserByCredentials } from '../../database/database';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';

export default function LoginScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRole, setActiveRole] = useState('admin');
  const setUser = useStore(s => s.setUser);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await getUserByCredentials(username.trim(), password.trim());
      if (!user) {
        setError('Identifiants incorrects');
      } else if (user.role !== activeRole) {
        setError(
          activeRole === 'admin'
            ? 'Ce compte n\'est pas administrateur'
            : 'Ce compte n\'est pas un compte adhérent',
        );
      } else {
        setUser(user);
      }
    } catch (e) {
      setError('Erreur de connexion : ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.bg, '#0A1520', '#071018']} style={styles.gradient}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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

        {/* Role tabs */}
        <View style={styles.roleTabs}>
          <TouchableOpacity
            style={[styles.roleTab, activeRole === 'admin' && styles.roleTabActive]}
            onPress={() => setActiveRole('admin')}
          >
            <MaterialCommunityIcons
              name="shield-account"
              size={18}
              color={activeRole === 'admin' ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={[styles.roleTabText, activeRole === 'admin' && styles.roleTabTextActive]}>
              Administrateur
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleTab, activeRole === 'adherent' && styles.roleTabActive]}
            onPress={() => setActiveRole('adherent')}
          >
            <MaterialCommunityIcons
              name="account"
              size={18}
              color={activeRole === 'adherent' ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={[styles.roleTabText, activeRole === 'adherent' && styles.roleTabTextActive]}>
              Adhérent
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connexion</Text>

          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={activeRole === 'adherent' ? 'Code adhérent' : 'Nom d\'utilisateur'}
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="lock-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mot de passe"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
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
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle" size={15} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="login" size={20} color="#fff" />
                <Text style={styles.loginText}>Se connecter</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            {activeRole === 'admin' ? (
              <>Admin : <Text style={{ color: COLORS.primary }}>admin</Text> / <Text style={{ color: COLORS.primary }}>admin123</Text></>
            ) : (
              <>Identifiant = code adhérent · Mot de passe = date de naissance (AAMMJJ)</>
            )}
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>CMBClub v1.0 · Saison 2025-2026</Text>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  brand: { alignItems: 'center', gap: 8 },
  logoRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.primary + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    ...SHADOWS.card,
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 2,
  },
  tagline: {
    color: COLORS.textSecondary,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.full,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
  },
  roleTabActive: {
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary + '50',
  },
  roleTabText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  roleTabTextActive: { color: COLORS.primary },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
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
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: 14,
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
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    flex: 1,
  },
  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...SHADOWS.button,
  },
  loginText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
