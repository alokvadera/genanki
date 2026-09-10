import { defineConfig } from "@neon/config/v1";

/**
 * genanki API — Neon Function.
 *
 * Env loading: `neon deploy --env .env.local` loads the file into process.env
 * before this file is evaluated. Required secrets (ENCRYPTION_PEPPER,
 * ADMIN_SECRET) must be present or the deploy fails closed. Provider keys
 * (GROQ_API_KEY etc.) are optional — their absence disables that provider.
 */
const optional = (key: string): Record<string, string> => {
  const value = process.env[key];
  return value !== undefined && value !== "" ? { [key]: value } : {};
};

const optionalKeys = [
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_APP_NAME",
  "OPENROUTER_APP_URL",
  "KILO_API_KEY",
  "KILO_BASE_URL",
  "KILO_MODEL_IDS",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_MODEL_IDS",
  "CLOUDFLARE_DAILY_NEURON_BUDGET",
  "ALLOWED_ORIGINS",
] as const;

const optionalEnv = Object.assign(
  {},
  ...optionalKeys.map((k) => optional(k)),
) as Record<string, string>;

export default defineConfig({
  // Neon Auth (managed Better Auth) — sessions verify via JWKS in server/auth.ts
  auth: true,
  preview: {
    functions: {
      api: {
        name: "genanki api",
        source: "server/app.ts",
        env: {
          // Required: server-side secrets (fail closed when missing)
          ENCRYPTION_PEPPER: process.env.ENCRYPTION_PEPPER!,
          ADMIN_SECRET: process.env.ADMIN_SECRET!,
          ...optionalEnv,
        },
      },
    },
  },
});
