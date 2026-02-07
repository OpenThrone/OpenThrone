export type ApiAuthActorType =
  | 'anonymous'
  | 'session_user'
  | 'session_admin'
  | 'api_client'
  | 'service_token';

export interface ApiAuthActor {
  type: ApiAuthActorType;
  userId?: number;
  clientId?: number;
}
