jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { readFile: jest.fn() },
}));

import RNFS from 'react-native-fs';
import { getAdherentPhotoUri, resolveAdherentPhotoDataUri } from './adherentPhotos';

describe('adherentPhotos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the original MIME type for embedded images', async () => {
    const photo = 'data:image/png;base64,cG5n';

    expect(getAdherentPhotoUri(photo)).toBe(photo);
    await expect(resolveAdherentPhotoDataUri(photo)).resolves.toBe(photo);
    expect(RNFS.readFile).not.toHaveBeenCalled();
  });

  it('normalizes raw base64 for native image sources', () => {
    const base64 = 'a'.repeat(200);
    expect(getAdherentPhotoUri(base64)).toBe(`data:image/jpeg;base64,${base64}`);
  });

  it('converts local image files to data URIs with their MIME type', async () => {
    RNFS.readFile.mockResolvedValue('cG5n');

    await expect(resolveAdherentPhotoDataUri('file:///photos/member%20one.png'))
      .resolves.toBe('data:image/png;base64,cG5n');
    expect(RNFS.readFile).toHaveBeenCalledWith('/photos/member one.png', 'base64');
  });

  it('does not silently return a local URI when reading the file fails', async () => {
    RNFS.readFile.mockRejectedValue(new Error('Permission denied'));

    await expect(resolveAdherentPhotoDataUri('/photos/member.jpg'))
      .rejects.toThrow('Permission denied');
  });
});
