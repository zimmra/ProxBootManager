import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import guestsRouter from './routes/guests';
import configRouter from './routes/config';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'proxbootmanager-backend', timestamp: new Date().toISOString() });
});

app.use('/api/guests', guestsRouter);
app.use('/api/config', configRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status =
    err instanceof Error && 'response' in err
      ? ((err as { response?: { status?: number } }).response?.status ?? 500)
      : 500;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
