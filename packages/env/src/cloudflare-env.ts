import { z } from "zod";

export const cloudflareEnvSchema = z.object({
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_KV_NAMESPACE_ID: z.string().min(1),
  CLOUDFLARE_REDIRECT_WORKER_NAME: z.string().min(1),
});
export type CloudflareEnv = z.infer<typeof cloudflareEnvSchema>;
