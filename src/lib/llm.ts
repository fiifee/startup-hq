import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { db } from "./db";
import { decrypt } from "./crypto";

export const PROVIDERS = {
  anthropic: { label: "Claude", company: "Anthropic", defaultModel: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { label: "ChatGPT", company: "OpenAI", defaultModel: "gpt-5.5", keyUrl: "https://platform.openai.com/api-keys" },
  google: { label: "Gemini", company: "Google", defaultModel: "gemini-flash-latest", keyUrl: "https://aistudio.google.com/apikey" },
} as const;
export type Provider = keyof typeof PROVIDERS;

/**
 * The founder's own model. Each founder's in-app AI runs on their own key, so
 * nobody spends someone else's credits.
 */
export async function modelFor(userId: string, provider?: Provider): Promise<{ model: LanguageModel; agent: string; provider: Provider } | null> {
  const keys = await db.aiKey.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const key = provider ? keys.find((k) => k.provider === provider) : keys[0];
  if (!key) return null;
  const apiKey = decrypt(key.encrypted);
  const p = key.provider as Provider;
  const model =
    p === "anthropic" ? createAnthropic({ apiKey })(key.model)
    : p === "openai" ? createOpenAI({ apiKey })(key.model)
    : createGoogleGenerativeAI({ apiKey })(key.model);
  return { model, agent: PROVIDERS[p].label, provider: p };
}
