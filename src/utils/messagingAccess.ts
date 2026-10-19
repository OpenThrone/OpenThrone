/**
 * Whether the viewer may message other players in the UI. Mirrors the server
 * rule (assertMessagingAllowed): the admin switch, or an admin/moderator.
 */
export const canMessage = (
  config: { enableMessaging?: boolean } | null | undefined,
  user: { staffRoles?: string[] | null } | null | undefined,
): boolean =>
  config?.enableMessaging === true ||
  (user?.staffRoles ?? []).some(
    (role) => role === 'ADMINISTRATOR' || role === 'MODERATOR',
  );
