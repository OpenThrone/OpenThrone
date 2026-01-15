import { beforeEach, describe, expect, it, vi } from 'bun:test';

import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from '../../../test/utils/mockPrisma';

installMockPrisma(vi);

const { AccountService } = require('../Account.service');

describe('AccountService', () => {
  beforeEach(() => {
    resetMockPrisma();
    // Setup common mocks
    mockPrisma.passwordReset = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    };
    mockPrisma.accountStatusHistory = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.bank_history = {
      create: vi.fn().mockResolvedValue({}),
    };

    // Mock nodemailer to prevent real email sending
    const nodemailer = require('nodemailer');
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    });
  });

  describe('Password validation', () => {
    it('should validate password change data correctly', async () => {
      const validData = {
        currentPassword: 'currentPass123',
        newPassword: 'newPass456',
        confirmPassword: 'newPass456',
      };

      // Mock user with valid password hash
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        password_hash:
          '$argon2id$v=19$m=65536,t=3,p=4$testhash1234567890123456789012$testhash',
      });

      // Mock argon2 verification to return true
      const argon2 = require('argon2');
      vi.spyOn(argon2, 'verify').mockResolvedValue(true);
      vi.spyOn(argon2, 'hash').mockResolvedValue(
        '$argon2id$v=19$m=65536,t=3,p=4$newhash1234567890123456789012$newhash',
      );

      const result = await AccountService.changePassword(1, validData);
      expect(result.message).toBe('Password updated successfully.');
    });

    it('should reject mismatched passwords', async () => {
      const invalidData = {
        currentPassword: 'currentPass123',
        newPassword: 'newPass456',
        confirmPassword: 'differentPassword',
      };

      await expect(
        AccountService.changePassword(1, invalidData),
      ).rejects.toThrow();
    });

    it('should reject short passwords', async () => {
      const invalidData = {
        currentPassword: 'currentPass123',
        newPassword: 'short',
        confirmPassword: 'short',
      };

      await expect(
        AccountService.changePassword(1, invalidData),
      ).rejects.toThrow();
    });
  });

  describe('Game options validation', () => {
    it('should validate game options correctly', async () => {
      const validData = {
        locale: 'en-US',
        colorScheme: 'HUMAN',
      };

      mockPrisma.users.update.mockResolvedValue({ id: 1 });

      const result = await AccountService.updateGameOptions(1, validData);
      expect(result.message).toBe('Game options updated successfully.');
    });

    it('should reject invalid locale', async () => {
      const invalidData = {
        locale: 'invalid-locale',
        colorScheme: 'HUMAN',
      };

      await expect(
        AccountService.updateGameOptions(1, invalidData),
      ).rejects.toThrow();
    });

    it('should reject invalid color scheme', async () => {
      const invalidData = {
        locale: 'en-US',
        colorScheme: 'INVALID_SCHEME',
      };

      await expect(
        AccountService.updateGameOptions(1, invalidData),
      ).rejects.toThrow();
    });
  });

  describe('Email change validation', () => {
    it('should validate email correctly', async () => {
      const validData = {
        email: 'test@example.com',
      };

      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
      });

      const result = await AccountService.requestEmailChange(validData);
      expect(result.status).toBe(true);
    });

    it('should reject invalid email', async () => {
      const invalidData = {
        email: 'invalid-email',
      };

      await expect(
        AccountService.requestEmailChange(invalidData),
      ).rejects.toThrow();
    });
  });

  describe('Update last active', () => {
    it('should update last active timestamp with email', async () => {
      const lastActiveData = {
        email: 'test@example.com',
      };

      mockPrisma.users.update.mockResolvedValue({ id: 1 });

      const result = await AccountService.updateLastActive(lastActiveData);
      expect(result.message).toBe('Last active timestamp updated');
    });

    it('should update last active timestamp with userId', async () => {
      const lastActiveData = {
        userId: 123,
      };

      mockPrisma.users.update.mockResolvedValue({ id: 123 });

      const result = await AccountService.updateLastActive(lastActiveData);
      expect(result.userId).toBe(123);
    });

    it('should update last active timestamp with displayName', async () => {
      const lastActiveData = {
        displayName: 'TestUser',
      };

      mockPrisma.users.update.mockResolvedValue({ id: 1 });

      const result = await AccountService.updateLastActive(lastActiveData);
      expect(result.userId).toBe(1);
    });

    it('should reject update without identifiers', async () => {
      const lastActiveData = {};

      await expect(
        AccountService.updateLastActive(lastActiveData),
      ).rejects.toThrow('At least one identifier');
    });
  });

  describe('Vacation mode', () => {
    it('should start vacation mode successfully', async () => {
      const userId = 1;

      mockPrisma.accountStatusHistory.count.mockResolvedValue(0); // No vacations this year

      const result = await AccountService.startVacation(userId);
      expect(result.message).toBe('Vacation mode started');
    });

    it('should end vacation mode successfully', async () => {
      const userId = 1;

      mockPrisma.accountStatusHistory.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      const result = await AccountService.endVacation(userId);
      expect(result.message).toBe('Vacation mode ended');
    });
  });

  describe('Service methods exist', () => {
    it('should have all expected methods', () => {
      expect(typeof AccountService.changePassword).toBe('function');
      expect(typeof AccountService.updateGameOptions).toBe('function');
      expect(typeof AccountService.updateProfile).toBe('function');
      expect(typeof AccountService.requestEmailChange).toBe('function');
      expect(typeof AccountService.resetPasswordWithCode).toBe('function');
      expect(typeof AccountService.startVacation).toBe('function');
      expect(typeof AccountService.endVacation).toBe('function');
      expect(typeof AccountService.repairFortification).toBe('function');
      expect(typeof AccountService.resetAccount).toBe('function');
      expect(typeof AccountService.updateLastActive).toBe('function');
      expect(typeof AccountService.updateBonusPoints).toBe('function');
    });
  });
});
