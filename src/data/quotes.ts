export interface Quote {
  id: string;
  quote: string;
  author: string;
}

export const quotes: Quote[] = [
  {
    id: "1",
    quote: "Talk is cheap. Show me the code.",
    author: "Linus Torvalds",
  },
  {
    id: "2",
    quote: "Premature optimization is the root of all evil.",
    author: "Donald Knuth",
  },
  {
    id: "3",
    quote: "Simplicity is the soul of efficiency.",
    author: "Austin Freeman",
  },
];

export function findQuote(id: string): Quote | undefined {
  return quotes.find((q) => q.id === id);
}

export function randomQuote(): Quote {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
