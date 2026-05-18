import { Router } from "express";

const version = process.env.GIT_SHA ?? "dev";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", version });
});
