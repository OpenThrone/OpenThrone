import type { BlogPostDTO } from '@/services/Blog.service';

type DatedPost = Pick<BlogPostDTO, 'created_timestamp' | 'publishedAt'>;

/** Legacy posts without a publication date retain their original date. */
export function getNewsDate(post: DatedPost): string {
  return post.publishedAt && Number.isFinite(Date.parse(post.publishedAt))
    ? post.publishedAt
    : post.created_timestamp;
}

/** Keep pinned notices first, then newest publication first within each group. */
export function compareNewsPosts(a: BlogPostDTO, b: BlogPostDTO): number {
  return (
    Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
    Date.parse(getNewsDate(b)) - Date.parse(getNewsDate(a)) ||
    b.id - a.id
  );
}
