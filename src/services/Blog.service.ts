import { z } from 'zod';

import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

// Type definitions for blog operations
export interface BlogPost {
  id: number;
  title: string;
  content: string;
  postedby_id: number;
  created_timestamp: Date;
  postReadStatus?: {
    last_read_at: Date;
  }[];
}

// DTO returned to clients/pages (dates are ISO strings)
export interface BlogPostDTO {
  id: number;
  title: string;
  content: string;
  postedby_id: number;
  authorName?: string;
  created_timestamp: string; // ISO
  isRead: boolean;
  lastReadAt?: string | null;
  kind?: string;
  status?: string;
  isPinned?: boolean;
}

export interface CreatePostData {
  userId: number;
  title: string;
  content: string;
}

export interface UpdateReadStatusData {
  userId: number;
  postId: number;
}

// Zod schemas for validation
const CreatePostSchema = z.object({
  userId: z.number().int(),
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
});

const UpdateReadStatusSchema = z.object({
  userId: z.number().int(),
  postId: z.number().int(),
});

// Result interfaces
export interface BlogOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface BlogPostsResult {
  posts: BlogPostDTO[];
}

export class BlogService {
  /**
   * Creates a new blog post
   */
  static async createPost(data: CreatePostData): Promise<BlogOperationResult> {
    const validatedData = CreatePostSchema.parse(data);
    const { userId, title, content } = validatedData;

    try {
      const newPost = await prisma.blog_posts.create({
        data: {
          title,
          content,
          postedby_id: userId,
          status: 'PUBLISHED',
          kind: 'NEWS',
          publishedAt: new Date(),
        },
      });

      return {
        success: true,
        message: 'Blog post created successfully',
        data: newPost,
      };
    } catch (error: any) {
      logError('Error creating blog post', { userId, title, error });
      throw error;
    }
  }

  /**
   * Gets all blog posts with read status for a user if provided
   */
  static async getPosts(
    userId?: number,
    filters?: { status?: string },
  ): Promise<BlogPostsResult> {
    const where = filters?.status ? { status: filters.status } : {};
    try {
      let posts = [] as any[];
      if (userId) {
        posts = await prisma.blog_posts.findMany({
          where,
          include: {
            postReadStatus: {
              where: {
                user_id: userId,
              },
              select: {
                last_read_at: true,
              },
            },
          },
          orderBy: {
            created_timestamp: 'desc',
          },
        });
      } else {
        posts = await prisma.blog_posts.findMany({
          where,
          orderBy: {
            created_timestamp: 'desc',
          },
        });
      }

      // Transform posts into DTOs (serialize dates and compute read status)
      const dtos: BlogPostDTO[] = posts.map((p: any) => {
        const isRead = p.postReadStatus && p.postReadStatus.length > 0;
        return {
          id: p.id,
          title: p.title,
          content: p.content,
          postedby_id: p.postedby_id,
          created_timestamp:
            p.created_timestamp instanceof Date
              ? p.created_timestamp.toISOString()
              : String(p.created_timestamp),
          isRead: Boolean(isRead),
          lastReadAt:
            isRead && p.postReadStatus[0] && p.postReadStatus[0].last_read_at
              ? p.postReadStatus[0].last_read_at instanceof Date
                ? p.postReadStatus[0].last_read_at.toISOString()
                : String(p.postReadStatus[0].last_read_at)
              : null,
          kind: p.kind ?? 'NEWS',
          status: p.status ?? 'PUBLISHED',
          isPinned: p.isPinned ?? false,
        };
      });

      const authorIds = [...new Set(posts.map((p: any) => p.postedby_id))];
      if (authorIds.length > 0) {
        const authors = await prisma.users.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, display_name: true },
        });
        const authorMap = new Map(
          authors.map((a: { id: number; display_name: string | null }) => [
            a.id,
            a.display_name,
          ]),
        );
        for (const dto of dtos) {
          dto.authorName = authorMap.get(dto.postedby_id) ?? undefined;
        }
      }

      return { posts: dtos };
    } catch (error: any) {
      logError('Error getting blog posts', { userId, error });
      throw error;
    }
  }

  /**
   * Gets recent blog posts (alias for getPosts)
   */
  static async getRecentPosts(userId?: number): Promise<BlogPostsResult> {
    return this.getPosts(userId, { status: 'PUBLISHED' });
  }

  /**
   * Get a single post by id, optionally including the read status for a user
   */
  static async getPost(
    postId: number,
    userId?: number,
  ): Promise<{ post: BlogPost | null }> {
    try {
      const include = userId
        ? {
            postReadStatus: {
              where: {
                user_id: userId,
              },
              select: {
                last_read_at: true,
              },
            },
          }
        : undefined;

      const post = await prisma.blog_posts.findUnique({
        where: { id: postId },
        include: include as any,
      });

      if (!post) return { post: null };

      // transform to DTO if include requested or not
      const isRead = post.postReadStatus && post.postReadStatus.length > 0;
      const dto: BlogPostDTO = {
        id: post.id,
        title: post.title,
        content: post.content,
        postedby_id: post.postedby_id,
        created_timestamp:
          post.created_timestamp instanceof Date
            ? post.created_timestamp.toISOString()
            : String(post.created_timestamp),
        isRead: Boolean(isRead),
        lastReadAt:
          isRead &&
          post.postReadStatus[0] &&
          post.postReadStatus[0].last_read_at
            ? post.postReadStatus[0].last_read_at instanceof Date
              ? post.postReadStatus[0].last_read_at.toISOString()
              : String(post.postReadStatus[0].last_read_at)
            : null,
      };

      if (post.postedby_id) {
        const author = await prisma.users.findUnique({
          where: { id: post.postedby_id },
          select: { display_name: true },
        });
        dto.authorName = author?.display_name ?? undefined;
      }

      return { post: dto as any };
    } catch (error: any) {
      logError('Error getting post', { postId, userId, error });
      throw error;
    }
  }

  /**
   * Updates the read status for a blog post
   */
  static async updateReadStatus(
    data: UpdateReadStatusData,
  ): Promise<BlogOperationResult> {
    const validatedData = UpdateReadStatusSchema.parse(data);
    const { userId, postId } = validatedData;

    try {
      await prisma.post_read_status.upsert({
        where: {
          post_id_user_id: {
            user_id: userId,
            post_id: postId,
          },
        },
        update: {
          last_read_at: new Date(),
        },
        create: {
          user_id: userId,
          post_id: postId,
          last_read_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'Read status updated successfully',
      };
    } catch (error: any) {
      logError('Error updating read status', { userId, postId, error });
      throw error;
    }
  }

  /**
   * Gets the latest unread post from the last 2 weeks
   */
  static async getLatestUnreadPost(
    userId: number,
  ): Promise<BlogOperationResult> {
    try {
      // Calculate the date 2 weeks ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const posts = await prisma.blog_posts.findMany({
        where: {
          created_timestamp: { gte: twoWeeksAgo },
        },
        orderBy: {
          created_timestamp: 'desc',
        },
      });

      if (posts.length === 0) {
        return {
          success: false,
          message: 'No posts found',
        };
      }

      // Check if the latest post has been read
      const latestRead = await prisma.post_read_status.count({
        where: {
          user_id: userId,
          post_id: posts[0].id,
        },
      });

      if (latestRead > 0) {
        return {
          success: false,
          message: 'No recent unread posts found',
        };
      }

      return {
        success: true,
        message: 'Latest unread post found',
        data: posts[0],
      };
    } catch (error: any) {
      logError('Error getting latest unread post', { userId, error });
      throw error;
    }
  }
}
