import { NativeModules } from 'react-native';

export function printHtml(html) {
  const printer = NativeModules.CmbClubPrint;
  if (!printer || typeof printer.print !== 'function') {
    return Promise.reject(new Error('L’impression n’est pas disponible sur cet appareil.'));
  }
  return printer.print(html, 'CMBClub');
}
