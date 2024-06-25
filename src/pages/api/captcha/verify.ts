const verifyEndpoint =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const secret = process.env.NEXT_PUBLIC_TURNSTILE_SECRET;

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { token } = req.body;
      const response = await fetch(verifyEndpoint, {
        method: 'POST',
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      });
      
      if (!response.ok) throw new Error('Verification failed'); // Handle fetch errors
      
      const data = await response.json();
      return res.status(data.success ? 200 : 400).json(data);
    }
    return res.status(405).send('Method not allowed'); // Handle any other HTTP methods
  } catch (error) {
    console.error('Error in /api/verify:', error);
    return res.status(500).send('Internal Server Error');
  }
}

