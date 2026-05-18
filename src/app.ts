import express from "express";
import { healthRouter } from "./routes/health";
import { quotesRouter } from "./routes/quotes";

export function createApp() {
  const app = express();
  app.use(healthRouter);
  app.use(quotesRouter);
  return app;
}
