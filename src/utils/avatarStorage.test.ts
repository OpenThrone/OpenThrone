import { describe, expect, it } from 'bun:test';
import path from 'path';

import {
  avatarExtensionFromImageType,
  buildAvatarFileName,
  resolveAvatarPath,
} from './avatarStorage';

const HASH = 'a'.repeat(64);

describe('avatar storage helpers', () => {
  it('builds names from user ID and content hash only', () => {
    expect(buildAvatarFileName(125, HASH, 'png')).toBe(
      `125-${'a'.repeat(32)}.png`,
    );
  });

  it('rejects an invalid owner, hash, or extension', () => {
    expect(() => buildAvatarFileName(0, HASH, 'png')).toThrow();
    expect(() => buildAvatarFileName(125, '../../x', 'png')).toThrow();
    expect(() => buildAvatarFileName(125, HASH, 'sh')).toThrow();
  });

  it('maps decoded image types to stored extensions', () => {
    expect(avatarExtensionFromImageType('jpeg')).toBe('jpg');
    expect(avatarExtensionFromImageType('webp')).toBe('webp');
    expect(avatarExtensionFromImageType('svg')).toBeNull();
    expect(avatarExtensionFromImageType(undefined)).toBeNull();
  });

  it('keeps resolved paths inside the avatar directory', () => {
    const dir = path.join('/srv/app/public', 'users/125/avatar');
    expect(resolveAvatarPath(dir, `125-${'a'.repeat(32)}.png`)).toBe(
      path.join(dir, `125-${'a'.repeat(32)}.png`),
    );
    expect(() => resolveAvatarPath(dir, '../../evil.png')).toThrow(
      'escapes the upload directory',
    );
    expect(() => resolveAvatarPath(dir, '/etc/cron.d/evil')).toThrow(
      'escapes the upload directory',
    );
    expect(() => resolveAvatarPath(dir, 'sub/evil.png')).toThrow(
      'escapes the upload directory',
    );
  });
});
