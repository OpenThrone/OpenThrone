import { randomUUID } from 'crypto';
import type { NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import type { z, ZodTypeAny } from 'zod';

import { authOptions } from '@/pages/api/auth/[...nextauth]';
import type { AuthenticatedRequest } from '@/types/api';
import type { ApiAuthActorType } from '@/types/api-auth';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

type AuthMode = 'none' | 'optional' | 'required' | 'admin';

type InferOrUnknown<TSchema extends ZodTypeAny | undefined> =
  TSchema extends ZodTypeAny ? z.infer<TSchema> : unknown;

interface ApiGuardOptions<
  TQuerySchema extends ZodTypeAny | undefined = undefined,
  TBodySchema extends ZodTypeAny | undefined = undefined,
> {
  methods: readonly string[];
  authMode?: AuthMode;
  querySchema?: TQuerySchema;
  bodySchema?: TBodySchema;
}

interface ApiGuardContext<TQuery, TBody> {
  requestId: string;
  actorType: ApiAuthActorType;
  query: TQuery;
  body: TBody;
}

type ApiGuardHandler<TQuery, TBody> = (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: ApiGuardContext<TQuery, TBody>,
) => Promise<unknown> | unknown;

export function withApiGuard<
  TQuerySchema extends ZodTypeAny | undefined = undefined,
  TBodySchema extends ZodTypeAny | undefined = undefined,
>(options: ApiGuardOptions<TQuerySchema, TBodySchema>) {
  const { methods, authMode = 'required', querySchema, bodySchema } = options;
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

      if (!methodSet.has((req.method || '').toUpperCase())) {
        res.setHeader('Allow', allowHeader);
        return res.status(405).json({ message: 'Method not allowed' });
      }

      const session = await getServerSession(req, res, authOptions);
      req.session = session ?? undefined;

      const sessionUserId = session?.user?.id;
      const hasSession = !!sessionUserId;

      if ((authMode === 'required' || authMode === 'admin') && !hasSession) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      let actorType: ApiAuthActorType = hasSession
        ? 'session_user'
        : 'anonymous';

      if (authMode === 'admin') {
        if (!hasSession) {
          return res.status(401).json({ message: 'Unauthorized' });
        }

        const adminUserId = Number(sessionUserId);
        if (!(await isAdmin(adminUserId))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        actorType = 'session_admin';
      }

      const queryParsed = querySchema?.safeParse(req.query);
      if (queryParsed && !queryParsed.success) {
        return res.status(422).json({
          message: 'Invalid query parameters',
          details: queryParsed.error.flatten().fieldErrors,
        });
      }

      const bodyParsed = bodySchema?.safeParse(req.body);
      if (bodyParsed && !bodyParsed.success) {
        return res.status(422).json({
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors,
        });
      }

      try {
        return await handler(req, res, {
          requestId,
          actorType,
          query: (queryParsed?.data ??
            (req.query as unknown)) as InferOrUnknown<TQuerySchema>,
          body: (bodyParsed?.data ??
            (req.body as unknown)) as InferOrUnknown<TBodySchema>,
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
