import argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

const TOKEN_PREFIX_LENGTH = 8;
const TOKEN_SECRET_LENGTH = 32;

export interface IssueApiTokenInput {
  name: string;
  ownerUserId?: number;
  clientType?: 'USER' | 'SYSTEM' | 'SERVICE';
  scopes: string[];
  expiresAt?: Date;
}

export interface VerifyApiTokenInput {
  bearerToken: string;
  requiredScopes?: string[];
  route: string;
  method: string;
  ip?: string;
  userAgent?: string;
}

export interface VerifyApiTokenResult {
  ok: boolean;
  reason?: string;
  statusCode?: number;
  actorType?: 'api_client' | 'service_token';
  clientId?: number;
  tokenId?: number;
  scopes?: string[];
}

const sha256Hex = (value?: string): string | undefined => {
  if (!value) return undefined;
  return createHash('sha256').update(value).digest('hex');
};

const parseApiToken = (token: string) => {
  const parts = token.split('_');
  if (parts.length < 4 || parts[0] !== 'otk') {
    return null;
  }

  const prefix = parts[2];
  const secret = parts.slice(3).join('_');
  if (!prefix || !secret) {
    return null;
  }

  return { prefix, secret };
};

const toBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }
  return token.trim();
};

export class ApiTokenService {
  static parseBearerToken(authorizationHeader?: string): string | null {
    return toBearerToken(authorizationHeader);
  }

  static async issueToken(input: IssueApiTokenInput) {
    const {
      name,
      ownerUserId,
      clientType = 'SYSTEM',
      scopes,
      expiresAt,
    } = input;
    const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    const prefix = randomBytes(TOKEN_PREFIX_LENGTH).toString('hex').slice(0, 8);
    const secret = randomBytes(TOKEN_SECRET_LENGTH).toString('hex');
    const pepper = process.env.API_TOKEN_PEPPER ?? '';
    const tokenHash = await argon2.hash(`${secret}${pepper}`, {
      type: argon2.argon2id,
    });

    const client = await prisma.apiClient.create({
      data: {
        ownerUserId,
        name,
        clientType,
      },
    });

    const token = await prisma.apiToken.create({
      data: {
        clientId: client.id,
        tokenPrefix: prefix,
        tokenHash,
        scopes,
        expiresAt,
      },
    });

    return {
      token: `otk_${env}_${prefix}_${secret}`,
      tokenId: token.id,
      clientId: client.id,
      tokenPrefix: prefix,
    };
  }

  static async revokeToken(tokenId: number) {
    await prisma.apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  static async verifyToken(
    input: VerifyApiTokenInput,
  ): Promise<VerifyApiTokenResult> {
    const parsed = parseApiToken(input.bearerToken);
    if (!parsed) {
      return { ok: false, reason: 'invalid_format', statusCode: 401 };
    }

    const token = await prisma.apiToken.findUnique({
      where: { tokenPrefix: parsed.prefix },
      include: { client: true },
    });

    if (!token || token.client.status !== 'ACTIVE') {
      return { ok: false, reason: 'token_not_found', statusCode: 401 };
    }

    if (token.revokedAt) {
      await this.audit(token.id, 'REJECT_REVOKED', input, 401);
      return { ok: false, reason: 'token_revoked', statusCode: 401 };
    }

    if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
      await this.audit(token.id, 'REJECT_EXPIRED', input, 401);
      return { ok: false, reason: 'token_expired', statusCode: 401 };
    }

    const pepper = process.env.API_TOKEN_PEPPER ?? '';
    const valid = await argon2.verify(
      token.tokenHash,
      `${parsed.secret}${pepper}`,
    );
    if (!valid) {
      await this.audit(token.id, 'REJECT_HASH_MISMATCH', input, 401);
      return { ok: false, reason: 'token_invalid', statusCode: 401 };
    }

    const requiredScopes = input.requiredScopes ?? [];
    const hasScopes = requiredScopes.every((scope) =>
      token.scopes.includes(scope),
    );
    if (!hasScopes) {
      await this.audit(token.id, 'REJECT_SCOPE', input, 403);
      return { ok: false, reason: 'insufficient_scope', statusCode: 403 };
    }

    const now = new Date();
    const ipHash = sha256Hex(input.ip);
    await prisma.$transaction([
      prisma.apiToken.update({
        where: { id: token.id },
        data: {
          lastUsedAt: now,
          lastIpHash: ipHash,
        },
      }),
      prisma.apiClient.update({
        where: { id: token.clientId },
        data: { lastUsedAt: now },
      }),
      prisma.apiTokenAudit.create({
        data: {
          tokenId: token.id,
          action: 'ALLOW',
          route: input.route,
          method: input.method,
          statusCode: 200,
          ipHash,
          uaHash: sha256Hex(input.userAgent),
        },
      }),
    ]);

    return {
      ok: true,
      actorType:
        token.client.clientType === 'SERVICE' ? 'service_token' : 'api_client',
      clientId: token.clientId,
      tokenId: token.id,
      scopes: token.scopes,
    };
  }

  private static async audit(
    tokenId: number,
    action: string,
    input: VerifyApiTokenInput,
    statusCode: number,
  ) {
    try {
      await prisma.apiTokenAudit.create({
        data: {
          tokenId,
          action,
          route: input.route,
          method: input.method,
          statusCode,
          ipHash: sha256Hex(input.ip),
          uaHash: sha256Hex(input.userAgent),
        },
      });
    } catch (error) {
      logError('Failed to write api token audit', { tokenId, action, error });
    }
  }
}
