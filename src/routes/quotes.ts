import { Router } from "express";
import { findQuote, randomQuote } from "../data/quotes";

export const quotesRouter = Router();

quotesRouter.get("/quotes", (_req, res) => {
  res.json(randomQuote());
});

quotesRouter.get("/quotes/:id", (req, res) => {
  const quote = findQuote(req.params.id);
  if (!quote) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(quote);
});
