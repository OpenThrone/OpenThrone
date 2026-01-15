import { describe, expect, it, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';

import { generateRandomString, getAvatarSrc } from './utilities';

// Install deterministic mtRand before importing modules that may use randomness
installMockMtRand(vi);

describe('generateRandomString', () => {
  it('should generate a random string of the specified length', () => {
    const length = 10;
    const randomString = generateRandomString(length);
    expect(randomString.length).toBe(length);
  });

  it('should only contain alphanumeric characters', () => {
    const length = 10;
    const randomString = generateRandomString(length);
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    expect(alphanumericRegex.test(randomString)).toBe(true);
  });

  it('should generate different strings for different calls', () => {
    const length = 10;
    const randomString1 = generateRandomString(length);
    const randomString2 = generateRandomString(length);
    expect(randomString1).not.toBe(randomString2);
  });
});

describe('getAvatarSrc', () => {
  it("should return the user's avatar image source", () => {
    const avatar = 'SHIELD';
    // The implementation may return either a local path (/assets/...) or an S3 URL
    // depending on environment variables. Match the final filename so the test
    // is stable in both environments.
    expect(getAvatarSrc(avatar, 'ELF')).toMatch(/shields\/ELF_25x25\.webp$/);
    const avatar2 = 'http://example.com/image.jpg';
    expect(getAvatarSrc(avatar2)).toBe(avatar2);
  });
});
