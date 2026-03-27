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
    });

    expect(config.credentials.cloudflare.apiToken).toBe("cf-token");
    expect(config.credentials.tencent.secretId).toBe("secret-id");
    expect(config.credentials.tencent.secretKey).toBe("secret-key");
    expect(config.zones).toEqual({
      "ihongben.com": { provider: "tencent" },
      "maxtap.net": { provider: "cloudflare" },
    });
  });
});

