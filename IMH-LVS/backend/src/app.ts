import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import apiRouter from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';

export function createApp() {
  const app = express();

  // `credentials: true` is what allows the browser to send the session cookie
  // to an API on a different origin, and it is only safe because `origin` is
  // an explicit allow-list from FRONTEND_ORIGIN rather than a reflection of
  // whatever Origin arrived. Those two settings must move together: reflecting
  // the origin while allowing credentials would let any site a signed-in user
  // visits make authenticated calls to this API on their behalf.
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
