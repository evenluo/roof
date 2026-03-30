import { describe, expect, test } from "bun:test";

import { loadConfig } from "./config";

describe("loadConfig", () => {
  test("throws when required environment variables are missing", () => {
    expect(() => loadConfig({})).toThrow(
      'Missing required environment variable: CLOUDFLARE_API_TOKEN',
    );
  });

  test("returns configured zones and credentials", () => {
    const config = loadConfig({
      CLOUDFLARE_API_TOKEN: "cf-token",
      Q_DNS_RECORD_SECRET_ID: "secret-id",
      Q_DNS_RECORD_SECRET_KEY: "secret-key",
      ALIYUN_DNS_SECRET_ID: "ali-key-id",
      ALIYUN_DNS_SECRET_KEY: "ali-key-secret",
    });

    expect(config.credentials.cloudflare.apiToken).toBe("cf-token");
    expect(config.credentials.tencent.secretId).toBe("secret-id");
    expect(config.credentials.tencent.secretKey).toBe("secret-key");
    expect(config.credentials.aliyun.accessKeyId).toBe("ali-key-id");
    expect(config.credentials.aliyun.accessKeySecret).toBe("ali-key-secret");
    expect(config.zones).toEqual({
      "ihongben.com": { provider: "tencent" },
      "maxtap.net": { provider: "cloudflare" },
      "jctx.cc": { provider: "aliyun" },
      "junlintianxia.icu": { provider: "aliyun" },
      "junlintianxia.top": { provider: "aliyun" },
    });
  });
});

