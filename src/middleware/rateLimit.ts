import rateLimit, { MemoryStore } from 'express-rate-limit';

const globalStore = new MemoryStore();

const registerStore = new MemoryStore();

const highRiskStore = new MemoryStore();

// TODO: Consider moving to .env configuration

export const globalLimiter = rateLimit({
  store: globalStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: (req, res) => {
    res.status(429).json({
      error:
        'Too many requests from this IP address. Please try again later. Global',
    });
  },
  statusCode: 429,
  skip: (req) => {
    // Exempt localhost for development
    const ip = req.ip || req.connection.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    // TODO: Add admin IPs from env, e.g., process.env.ADMIN_IPS?.split(',').includes(ip)
  },
});

export const registerLimiter = rateLimit({
  store: registerStore,
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req, res) => {
    res.status(429).json({
      error:
        'Too many registration attempts from this IP. Please wait before trying again.',
    });
  },
  statusCode: 429,
  skip: (req) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
  },
});

export const highRiskLimiter = rateLimit({
  store: highRiskStore,
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req, res) => {
    res.status(429).json({
      error:
        'Too many requests to this sensitive endpoint. Please slow down. HighRisk',
    });
  },
  statusCode: 429,
  skip: (req) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
  },
});

export const runExpressMiddleware = (req: any, res: any, fn: any) => {
  return new Promise<void>((resolve, reject) => {
    try {
      fn(req, res, (err?: any) => {
        if (err) return reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
};
