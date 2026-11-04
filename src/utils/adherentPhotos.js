import { readLocalFileBase64 } from './readLocalFileBase64';

const DATA_IMAGE_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,/i;

function getPhotoMimeType(photo) {
  const dataUriMatch = photo.match(DATA_IMAGE_PATTERN);
  if (dataUriMatch) return dataUriMatch[1];

  const path = photo.split(/[?#]/, 1)[0].toLowerCase();
  const extension = path.match(/\.([a-z0-9]+)$/)?.[1];
  const mimeTypes = {
    avif: 'image/avif',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return mimeTypes[extension] || 'image/jpeg';
}

export function getAdherentPhotoUri(photo) {
  if (typeof photo !== 'string') return null;
  const uri = photo.trim();
  if (!uri) return null;
  if (DATA_IMAGE_PATTERN.test(uri)) return uri;

  if (uri.length > 128 && /^[A-Za-z0-9+/=\r\n]+$/.test(uri)) {
    return `data:image/jpeg;base64,${uri.replace(/\s/g, '')}`;
  }
  if (uri.startsWith('/')) {
    return `file://${uri.replace(/ /g, '%20')}`;
  }
  return uri;
}

export async function resolveAdherentPhotoDataUri(photo) {
  const uri = getAdherentPhotoUri(photo);
  if (!uri) return null;
  if (DATA_IMAGE_PATTERN.test(uri)) return uri;

  const base64 = await readLocalFileBase64(uri);
  if (!base64) {
    throw new Error('Le fichier de la photo de l’adhérent est vide.');
  }
  return `data:${getPhotoMimeType(uri)};base64,${base64}`;
}
