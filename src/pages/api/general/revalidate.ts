import { z } from 'zod';

const RevalidateSchema = z.object({
  secret: z.string(),
});

export default async function handler(req, res) {
  const validatedQuery = RevalidateSchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  if (validatedQuery.data.secret !== process.env.REVALIDATION_SECRET) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  try {
    await res.revalidate('/community/stats')
    return res.json({ revalidated: true })
  } catch (err) {
    return res.status(500).send('Error revalidating')
  }
}