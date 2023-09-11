const verifyEndpoint =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const secret = process.env.NEXT_PUBLIC_TURNSTILE_SECRET;

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { token } = req.body;
    const response = await fetch(verifyEndpoint, {
      method: 'POST',
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(
        token
      )}`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json();
    return res.status(data.success ? 200 : 400).json(data);
  }
  res.status(405).send('Method not allowed'); // Handle any other HTTP methods
}
