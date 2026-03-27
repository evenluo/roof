export const SUPPORTED_ZONES = ["ihongben.com", "maxtap.net"] as const;

type SupportedZone = (typeof SUPPORTED_ZONES)[number];

type Provider = "cloudflare" | "tencent";

export interface AppConfig {
  credentials: {
    cloudflare: {
      apiToken: string;
    };
    tencent: {
      secretId: string;
      secretKey: string;
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
    },
    zones: {
      "ihongben.com": { provider: "tencent" },
      "maxtap.net": { provider: "cloudflare" },
    },
  };
}

