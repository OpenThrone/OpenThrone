export async function getAdminRequestError(
  response: Response,
): Promise<string> {
  const data = await response.json().catch(() => ({}));
  const message =
    data?.error ?? data?.message ?? `Request failed (${response.status})`;
  const fields =
    data?.details && typeof data.details === 'object'
      ? Object.keys(data.details)
      : [];
  return fields.length ? `${message}: ${fields.join(', ')}` : message;
}

export async function requireAdminResponse(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await getAdminRequestError(response));
}
