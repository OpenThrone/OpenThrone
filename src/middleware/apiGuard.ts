import { randomUUID } from 'crypto';
import type { NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import type { z, ZodTypeAny } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { rateLimiter } from '@/lib/rate-limiter';
import { isSessionAccountStatusAllowed } from '@/lib/sessionAccount';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { ApiTokenService } from '@/services/ApiToken.service';
import { getLoginBlockingStatus } from '@/services/User.service';
import type { AuthenticatedRequest } from '@/types/api';
import type { ApiAuthActor, ApiAuthActorType } from '@/types/api-auth';
import {
  hasAllPermissions as checkAllPermissions,
  hasAnyPermission as checkAnyPermission,
  isAdmin,
  isImpersonatedSession,
} from '@/utils/authorization';
import { resolveClientIp } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import {
  getMaintenanceBlock,
  getRuntimeFeatureBlock,
} from '@/utils/runtimeAccess';

type AuthMode = 'none' | 'optional' | 'required' | 'admin' | 'permission';
type RateLimitProfile =
  | 'auth'
  | 'password_reset'
  | 'attack'
  | 'attack_read'
  | 'spy'
  | 'bank'
  | 'admin'
  | 'public_read';

const RATE_LIMIT_PROFILES: Record<
  RateLimitProfile,
  { windowMs: number; max: number }
> = {
  auth: { windowMs: 60_000, max: 12 },
  password_reset: { windowMs: 60_000, max: 6 },
  attack: { windowMs: 60_000, max: 20 },
  // Attack-modal reads must never spend the attack submission budget.
  attack_read: { windowMs: 60_000, max: 60 },
  spy: { windowMs: 60_000, max: 20 },
  bank: { windowMs: 60_000, max: 15 },
  // Staff pages make several requests each; 30/min tripped normal browsing.
  admin: { windowMs: 60_000, max: 120 },
  // Cheap reads a page makes on every load (footer stats, recruit link info,
  // settings preferences). They shared the 12/min login budget, so normal
  // browsing blanked the footer and broke email preferences.
  public_read: { windowMs: 60_000, max: 120 },
};

/** Account restrictions that may still reach routes opting in via `allowRestrictedAccount`. */
export type AccountRestriction = 'BANNED' | 'SUSPENDED';

type InferOrUnknown<TSchema extends ZodTypeAny | undefined> =
  TSchema extends ZodTypeAny ? z.infer<TSchema> : unknown;

interface ApiGuardOptions<
  TQuerySchema extends ZodTypeAny | undefined = undefined,
  TBodySchema extends ZodTypeAny | undefined = undefined,
> {
  methods: readonly string[];
  authMode?: AuthMode;
  allowApiToken?: boolean;
  requiredScopes?: string[];
  requiredAnyPermissions?: PermissionType[];
  requiredAllPermissions?: PermissionType[];
  rateLimitProfile?: RateLimitProfile;
  querySchema?: TQuerySchema;
  bodySchema?: TBodySchema;
  /**
   * Lets BANNED/SUSPENDED sessions through (VACATION and CLOSED stay blocked).
   * Only for routes a restricted player still needs, such as filing or reading
   * their own ban appeal. The handler receives `context.accountRestriction`
   * and must limit such callers to their own data.
   */
  allowRestrictedAccount?: boolean;
}

interface ApiGuardContext<TQuery, TBody> {
  requestId: string;
  actor: ApiAuthActor;
  actorType: ApiAuthActorType;
  query: TQuery;
  body: TBody;
  /** Set when a restricted session was admitted via `allowRestrictedAccount`. */
  accountRestriction: AccountRestriction | null;
}

type ApiGuardHandler<TQuery, TBody> = (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: ApiGuardContext<TQuery, TBody>,
) => Promise<unknown> | unknown;

/** With API guard. */
export function withApiGuard<
  TQuerySchema extends ZodTypeAny | undefined = undefined,
  TBodySchema extends ZodTypeAny | undefined = undefined,
>(options: ApiGuardOptions<TQuerySchema, TBodySchema>) {
  const { methods, authMode = 'required', querySchema, bodySchema } = options;
  const {
    allowApiToken = false,
    requiredScopes = [],
    requiredAnyPermissions,
    requiredAllPermissions,
    rateLimitProfile,
    allowRestrictedAccount = false,
  } = options;
  const allowHeader = methods.join(', ');
  const methodSet = new Set(methods.map((method) => method.toUpperCase()));

  return (
      handler: ApiGuardHandler<
        InferOrUnknown<TQuerySchema>,
        InferOrUnknown<TBodySchema>
      >,
    ) =>
    async (req: AuthenticatedRequest, res: NextApiResponse) => {
      const requestId =
        (req.headers?.['x-request-id'] as string | undefined) ?? randomUUID();
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'DENY');
      if (process.env.NODE_ENV === 'production') {
        res.setHeader(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains; preload',
        );
      }

      if (!methodSet.has((req.method || '').toUpperCase())) {
        res.setHeader('Allow', allowHeader);
        return res.status(405).json({ message: 'Method not allowed' });
      }

      if (rateLimitProfile) {
        const profile = RATE_LIMIT_PROFILES[rateLimitProfile];
        const ip = getRequestIp(req) ?? 'unknown';
        const rateKey = `${rateLimitProfile}:${ip}`;
        const isAllowed = await rateLimiter(rateKey, profile);
        if (!isAllowed) {
          return res.status(429).json({ message: 'Too many requests' });
        }
      }

      const session = await getServerSession(req, res, authOptions);
      req.session = session ?? undefined;

      const sessionUserId = session?.user?.id;
      const hasSession = !!sessionUserId;

      // Impersonation stays in player context, even if the target is later
      // promoted. Permission requirements can also be attached to other modes.
      if (
        isImpersonatedSession(session) &&
        (authMode === 'admin' ||
          authMode === 'permission' ||
          requiredAnyPermissions ||
          requiredAllPermissions)
      ) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      let actorType: ApiAuthActorType = hasSession
        ? 'session_user'
        : 'anonymous';
      let actor: ApiAuthActor = hasSession
        ? { type: 'session_user', userId: Number(sessionUserId) }
        : { type: 'anonymous' };

      if (!hasSession && allowApiToken) {
        const bearer = ApiTokenService.parseBearerToken(
          req.headers.authorization,
        );
        if (bearer) {
          const verification = await ApiTokenService.verifyToken({
            bearerToken: bearer,
            requiredScopes,
            route: req.url ?? 'unknown',
            method: req.method ?? 'UNKNOWN',
            ip: getRequestIp(req),
            userAgent: req.headers['user-agent'],
          });

          if (!verification.ok) {
            return res.status(verification.statusCode ?? 401).json({
              message:
                verification.statusCode === 403 ? 'Forbidden' : 'Unauthorized',
            });
          }

          actorType = verification.actorType ?? 'api_client';
          actor = {
            type: actorType,
            clientId: verification.clientId,
            tokenId: verification.tokenId,
            scopes: verification.scopes,
          };
        }
      }

      try {
        const disabledFeature = await getRuntimeFeatureBlock(req.url, req.body);
        if (disabledFeature)
          return res
            .status(503)
            .json({ message: disabledFeature, code: 'FEATURE_DISABLED' });
        const maintenance = await getMaintenanceBlock(
          req.url,
          hasSession ? Number(sessionUserId) : undefined,
          isImpersonatedSession(session),
        );
        if (maintenance) {
          res.setHeader('Retry-After', '5');
          return res
            .status(503)
            .json({ message: maintenance, code: 'MAINTENANCE' });
        }
      } catch {
        return res.status(503).json({
          message: 'Runtime configuration unavailable',
          code: 'CONFIG_UNAVAILABLE',
        });
      }

      let accountRestriction: AccountRestriction | null = null;
      if (
        hasSession &&
        !(await isSessionAccountStatusAllowed(Number(sessionUserId)))
      ) {
        const blockingStatus = allowRestrictedAccount
          ? await getLoginBlockingStatus(Number(sessionUserId))
          : null;
        if (blockingStatus !== 'BANNED' && blockingStatus !== 'SUSPENDED') {
          return res.status(401).json({ message: 'Unauthorized' });
        }
        accountRestriction = blockingStatus;
      }
      // A restricted account never acts with staff privileges.
      if (
        accountRestriction &&
        (authMode === 'admin' ||
          authMode === 'permission' ||
          requiredAnyPermissions ||
          requiredAllPermissions)
      ) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (authMode === 'admin') {
        if (!hasSession) {
          return res.status(401).json({ message: 'Unauthorized' });
        }

        const adminUserId = Number(sessionUserId);
        if (!(await isAdmin(adminUserId))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        actorType = 'session_admin';
        actor = { type: 'session_admin', userId: adminUserId };
      }
      if (
        authMode === 'permission' ||
        requiredAnyPermissions ||
        requiredAllPermissions
      ) {
        if (!hasSession) {
          return res.status(401).json({ message: 'Unauthorized' });
        }

        const staffUserId = Number(sessionUserId);

        if (requiredAllPermissions && requiredAllPermissions.length > 0) {
          if (
            !(await checkAllPermissions(staffUserId, requiredAllPermissions))
          ) {
            return res.status(403).json({ message: 'Forbidden' });
          }
        }
        if (requiredAnyPermissions && requiredAnyPermissions.length > 0) {
          if (
            !(await checkAnyPermission(staffUserId, requiredAnyPermissions))
          ) {
            return res.status(403).json({ message: 'Forbidden' });
          }
        }

        actorType = 'session_admin';
        actor = { type: 'session_admin', userId: staffUserId };
      } else if (
        authMode === 'required' &&
        !hasSession &&
        actor.type === 'anonymous'
      ) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const queryParsed = querySchema?.safeParse(req.query);
      if (queryParsed && !queryParsed.success) {
        return res.status(422).json({
          message: 'Invalid query parameters',
          details: queryParsed.error.flatten().fieldErrors,
        });
      }

      const hasBody = ['POST', 'PUT', 'PATCH'].includes(
        (req.method ?? '').toUpperCase(),
      );
      const bodyParsed = hasBody ? bodySchema?.safeParse(req.body) : undefined;
      if (bodyParsed && !bodyParsed.success) {
        return res.status(422).json({
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors,
        });
      }

      try {
        return await handler(req, res, {
          requestId,
          actor,
          actorType,
          query: (queryParsed?.data ??
            (req.query as unknown)) as InferOrUnknown<TQuerySchema>,
          body: (bodyParsed?.data ??
            (req.body as unknown)) as InferOrUnknown<TBodySchema>,
          accountRestriction,
        });
      } catch (error) {
        logError('Unhandled API guard error', {
          requestId,
          route: req.url,
          method: req.method,
          error,
        });
        return res.status(500).json({
          message: 'Internal server error',
          requestId,
        });
      }
    };
}

const getRequestIp = (req: AuthenticatedRequest): string | undefined =>
  resolveClientIp(req);
