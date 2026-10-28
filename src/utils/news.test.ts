import { describe, expect, it } from 'bun:test';

import type { BlogPostDTO } from '@/services/Blog.service';
import { compareNewsPosts, getNewsDate } from '@/utils/news';

const post = (
  id: number,
  created: string,
  published?: string | null,
  isPinned = false,
): BlogPostDTO => ({
  id,
  created_timestamp: created,
  publishedAt: published,
  isPinned,
  title: 'News',
  content: '',
  postedby_id: 1,
  isRead: false,
});

describe('news publication order', () => {
  it('puts pinned notices first and an older draft published today ahead of earlier news', () => {
    const posts = [
      post(1, '2026-10-20', '2026-10-20'),
      post(2, '2026-10-19', null),
      post(3, '2026-10-10', '2026-10-23'),
      post(4, '2026-10-01', '2026-10-01', true),
      post(5, '2026-09-01', '2026-10-02', true),
    ];
    expect(posts.sort(compareNewsPosts).map((p) => p.id)).toEqual([
      5, 4, 3, 1, 2,
    ]);
  });

  it('uses creation dates for legacy, missing or invalid publication dates', () => {
    for (const published of [null, undefined, 'invalid']) {
      expect(getNewsDate(post(1, '2026-10-19', published))).toBe('2026-10-19');
    }
  });

  it('breaks equal-date ties consistently by descending ID', () => {
    const posts = [
      post(1, '2026-10-19'),
      post(3, '2026-10-19'),
      post(2, '2026-10-19'),
    ];
    expect(posts.sort(compareNewsPosts).map((p) => p.id)).toEqual([3, 2, 1]);
  });
});
