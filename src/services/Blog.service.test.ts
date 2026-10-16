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
    expect(post?.isRead).toBe(true);
    expect(post?.isPinned).toBe(true);
    expect(mockPrisma.blog_posts.findUnique.mock.calls[0][0].where).toEqual({
      id: 42,
      status: 'PUBLISHED',
    });
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
