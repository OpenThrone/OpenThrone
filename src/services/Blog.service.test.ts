import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { BlogService } = await import('@/services/Blog.service');

const publishedPost = {
  id: 42,
  title: 'Realm update',
  content: 'Published news',
  postedby_id: 1,
  created_timestamp: new Date('2026-10-03T12:00:00Z'),
  publishedAt: new Date('2026-10-04T12:00:00Z'),
  status: 'PUBLISHED',
  kind: 'NEWS',
  isPinned: true,
};

describe('public news publication boundaries', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.blog_posts = { findUnique: vi.fn(), findMany: vi.fn() };
    mockPrisma.users.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.users.findUnique = vi.fn().mockResolvedValue(null);
  });

  it('does not retrieve a guessed draft or archived ID', async () => {
    for (const status of ['DRAFT', 'ARCHIVED']) {
      mockPrisma.blog_posts.findUnique.mockImplementation(async ({ where }) =>
        where.status === status ? { ...publishedPost, status } : null,
      );
      expect((await BlogService.getPost(42)).post).toBeNull();
      expect(mockPrisma.blog_posts.findUnique).toHaveBeenCalledWith({
        where: { id: 42, status: 'PUBLISHED' },
        include: undefined,
      });
    }
  });

  it('returns published detail as a serializable DTO with read status', async () => {
    mockPrisma.blog_posts.findUnique.mockResolvedValue({
      ...publishedPost,
      postReadStatus: [{ last_read_at: new Date('2026-10-03T13:00:00Z') }],
    });
    const { post } = await BlogService.getPost(42, 7);
    expect(post?.created_timestamp).toBe('2026-10-03T12:00:00.000Z');
    expect(post?.publishedAt).toBe('2026-10-04T12:00:00.000Z');
    expect(post?.isRead).toBe(true);
    expect(post?.isPinned).toBe(true);
    expect(mockPrisma.blog_posts.findUnique.mock.calls[0][0].where).toEqual({
      id: 42,
      status: 'PUBLISHED',
    });
  });

  it('serializes publication dates and orders both anonymous and signed-in feeds', async () => {
    mockPrisma.blog_posts.findMany.mockResolvedValue([
      {
        ...publishedPost,
        id: 1,
        isPinned: false,
        created_timestamp: new Date('2026-10-20T12:00:00Z'),
        publishedAt: new Date('2026-10-20T12:00:00Z'),
      },
      {
        ...publishedPost,
        id: 2,
        isPinned: false,
        created_timestamp: new Date('2026-10-19T12:00:00Z'),
        publishedAt: null,
      },
      {
        ...publishedPost,
        id: 3,
        isPinned: false,
        created_timestamp: new Date('2026-10-10T12:00:00Z'),
        publishedAt: new Date('2026-10-23T12:00:00Z'),
      },
      publishedPost,
    ]);
    for (const userId of [undefined, 7]) {
      const { posts } = await BlogService.getPosts(userId);
      expect(posts.map((post) => post.id)).toEqual([42, 3, 1, 2]);
      expect(posts[1].publishedAt).toBe('2026-10-23T12:00:00.000Z');
      expect(posts[3].publishedAt).toBeNull();
      expect(() => JSON.stringify(posts)).not.toThrow();
    }
  });

  it('defaults the news feed to published posts', async () => {
    mockPrisma.blog_posts.findMany.mockResolvedValue([]);
    await BlogService.getPosts();
    expect(mockPrisma.blog_posts.findMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      orderBy: { created_timestamp: 'desc' },
    });
  });
});
