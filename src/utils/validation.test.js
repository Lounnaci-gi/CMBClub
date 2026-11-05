import { getLoginErrorMessage } from './validation';

describe('login error messages', () => {
  test('distinguishes rejected credentials, rate limiting, and server failures', () => {
    expect(getLoginErrorMessage({ status: 401 })).toBe('Identifiant ou mot de passe incorrect.');
    expect(getLoginErrorMessage({ status: 429 })).toBe('Trop de tentatives. Réessayez plus tard.');
    expect(getLoginErrorMessage({ status: 503 })).toBe('Le service de connexion est temporairement indisponible.');
    expect(getLoginErrorMessage({ status: 500 })).toContain('HTTP 500');
  });

  test('does not expose server error details in the login screen', () => {
    expect(getLoginErrorMessage({
      status: 500,
      message: 'Sensitive database or secret detail',
    })).not.toContain('Sensitive database or secret detail');
  });

  test('reports network errors without a status code', () => {
    expect(getLoginErrorMessage(new Error('Network request failed')))
      .toBe('Impossible de joindre le service. Vérifiez votre connexion Internet.');
  });
});
