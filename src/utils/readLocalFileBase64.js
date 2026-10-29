import RNFS from 'react-native-fs';

export function readLocalFileBase64(uri) {
  const path = uri.startsWith('file://')
    ? decodeURIComponent(uri.slice('file://'.length))
    : uri;
  return RNFS.readFile(path, 'base64');
}
