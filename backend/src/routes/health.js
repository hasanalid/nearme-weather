import { Router } from 'express';

export function healthRouter() {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
