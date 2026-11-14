import { resolveAvatarSrc } from '@/utils/utilities';

/** One player suggested by a display-name search. */
export interface PlayerMatch {
  id: number;
  displayName: string;
  /** Image URL, or undefined so Mantine's Avatar shows its placeholder. */
  avatarSrc: string | undefined;
}

type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Players whose display name matches `term`, for the name autocompletes.
 * The search API answers 404 when nothing matches, which is an empty result,
 * not an error. Stored avatars are not always URLs ("SHIELD" means the race
 * shield), so they are resolved here instead of being used as an image src.
 */
export const searchPlayersByName = async (
  term: string,
  fetchImpl: FetchLike = fetch,
): Promise<PlayerMatch[]> => {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const res = await fetchImpl(
    `/api/general/searchUsers?name=${encodeURIComponent(trimmed)}`,
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Player search failed (${res.status})`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((row: any) => ({
    id: Number(row.id),
    displayName: String(row.display_name),
    avatarSrc: resolveAvatarSrc(row.avatar, row.race),
  }));
};
