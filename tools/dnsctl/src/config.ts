import { config as loadDotenv } from "dotenv";

import type { Provider } from "./types";

export const SUPPORTED_ZONES = ["ihongben.com", "maxtap.net", "jctx.cc", "junlintianxia.icu", "junlintianxia.top"] as const;

type SupportedZone = (typeof SUPPORTED_ZONES)[number];

export interface AppConfig {
  credentials: {
    cloudflare: {
      apiToken: string;
    };
    tencent: {
      secretId: string;
      secretKey: string;
    };
    aliyun: {
      accessKeyId: string;
      accessKeySecret: string;
    };
  };
  zones: Record<SupportedZone, { provider: Provider }>;
}

function requireEnv(
  env: Partial<Record<string, string>>,
  key: string,
): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function loadConfig(
  env: Partial<Record<string, string>>,
): AppConfig {
  return {
    credentials: {
      cloudflare: {
        apiToken: requireEnv(env, "CLOUDFLARE_API_TOKEN"),
      },
      tencent: {
        secretId: requireEnv(env, "Q_DNS_RECORD_SECRET_ID"),
        secretKey: requireEnv(env, "Q_DNS_RECORD_SECRET_KEY"),
      },
      aliyun: {
        accessKeyId: requireEnv(env, "ALIYUN_DNS_SECRET_ID"),
        accessKeySecret: requireEnv(env, "ALIYUN_DNS_SECRET_KEY"),
      },
    },
    zones: {
      "ihongben.com": { provider: "tencent" },
      "maxtap.net": { provider: "cloudflare" },
      "jctx.cc": { provider: "aliyun" },
      "junlintianxia.icu": { provider: "aliyun" },
      "junlintianxia.top": { provider: "aliyun" },
    },
  };
}

export function loadRuntimeConfig(): AppConfig {
  loadDotenv({ path: "tools/dnsctl/.env.local", quiet: true });
  return loadConfig(process.env);
}
