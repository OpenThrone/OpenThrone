import prisma from '@/lib/prisma';
import { z } from 'zod';
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
  content: z.string().min(1, 'Content is required')
});

const UpdateReadStatusSchema = z.object({
  userId: z.number().int(),
  postId: z.number().int()
});

// Result interfaces
export interface BlogOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface BlogPostsResult {
  posts: BlogPost[];
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
  static async getPosts(userId?: number): Promise<BlogPostsResult> {
    try {
      if (userId) {
        // Fetch posts along with the read status for the current user
        const posts = await prisma.blog_posts.findMany({
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

        return { posts };
      } else {
        const posts = await prisma.blog_posts.findMany({
          orderBy: {
            created_timestamp: 'desc',
          },
        });

        return { posts };
      }
    } catch (error: any) {
      logError('Error getting blog posts', { userId, error });
      throw error;
    }
  }

  /**
   * Gets recent blog posts (alias for getPosts)
   */
  static async getRecentPosts(userId?: number): Promise<BlogPostsResult> {
    return this.getPosts(userId);
  }

  /**
   * Updates the read status for a blog post
   */
  static async updateReadStatus(data: UpdateReadStatusData): Promise<BlogOperationResult> {
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
  static async getLatestUnreadPost(userId: number): Promise<BlogOperationResult> {
    try {
      // Calculate the date 2 weeks ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const posts = await prisma.blog_posts.findMany({
        where: {
          created_timestamp: { gte: twoWeeksAgo }
        },
        orderBy: {
          created_timestamp: 'desc'
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
          post_id: posts[0].id
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

export default BlogService;