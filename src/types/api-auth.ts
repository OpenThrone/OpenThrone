/** Defines the API auth actor shape used by related workflows. */
export type ApiAuthActorType =
  | 'anonymous'
  | 'session_user'
  | 'session_admin'
  | 'api_client'
  | 'service_token';

/** Describes the API auth actor data contract. */
export interface ApiAuthActor {
  type: ApiAuthActorType;
  userId?: number;
  clientId?: number;
  tokenId?: number;
  scopes?: string[];
}
