import OpenAI from "openai";

/**
 * Groq client — OpenAI-compatible API, free tier.
 * Swap back to Anthropic later by changing imports in route files.
 */
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/** Fast model for main RAG answers and portfolio chat */
export const MODEL_LARGE = "llama-3.3-70b-versatile";

/** Lightweight model for suggestions, TikTok analysis, quick tasks */
export const MODEL_SMALL = "llama-3.1-8b-instant";
