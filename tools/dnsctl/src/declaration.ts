import { load as loadYaml } from "js-yaml";
import { readFileSync } from "node:fs";

import type { DnsTtl, NormalizedRecord, Provider } from "./types";
import { SUPPORTED_RECORD_TYPES, type SupportedRecordType } from "./types";

export interface DeclaredZone {
  provider: Provider;
  records: NormalizedRecord[];
}

export interface Declaration {
  zones: Record<string, DeclaredZone>;
}

function validateRecord(
  zoneName: string,
  provider: Provider,
  raw: unknown,
): NormalizedRecord {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Zone "${zoneName}": each record must be an object`);
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.name !== "string" || r.name.trim() === "") {
    throw new Error(`Zone "${zoneName}": record name must be a non-empty string`);
  }

  if (
    typeof r.type !== "string" ||
    !SUPPORTED_RECORD_TYPES.includes(r.type as SupportedRecordType)
  ) {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} has unsupported type "${r.type}". Supported: ${SUPPORTED_RECORD_TYPES.join(", ")}`,
    );
  }

  if (typeof r.value !== "string") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} value must be a string`,
    );
  }

  if (r.ttl !== "auto" && typeof r.ttl !== "number") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} ttl must be a number or "auto"`,
    );
  }

  if (r.ttl === "auto" && provider !== "cloudflare") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} ttl "auto" is only allowed for Cloudflare zones`,
    );
  }

  if (r.proxied !== undefined && typeof r.proxied !== "boolean") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} proxied must be a boolean`,
    );
  }

  if (r.proxied !== undefined && provider !== "cloudflare") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} "proxied" is only allowed for Cloudflare zones`,
    );
  }

  const record: NormalizedRecord = {
    name: r.name,
    type: r.type,
    value: r.value,
    ttl: r.ttl as DnsTtl,
  };

  if (provider === "cloudflare") {
    record.proxied = typeof r.proxied === "boolean" ? r.proxied : false;
  }

  return record;
}

function validateZone(zoneName: string, raw: unknown): DeclaredZone {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Zone "${zoneName}": must be an object`);
  }

  const zone = raw as Record<string, unknown>;

  if (
    typeof zone.provider !== "string" ||
    !["cloudflare", "tencent"].includes(zone.provider)
  ) {
    throw new Error(
      `Zone "${zoneName}": provider must be "cloudflare" or "tencent"`,
    );
  }

  const provider = zone.provider as Provider;

  if (!Array.isArray(zone.records)) {
    throw new Error(`Zone "${zoneName}": records must be an array`);
  }

  const seen = new Set<string>();
  const records: NormalizedRecord[] = [];

  for (const recordRaw of zone.records) {
    const record = validateRecord(zoneName, provider, recordRaw);
    const key = `${record.name}:${record.type}`;

    if (seen.has(key)) {
      throw new Error(
        `Zone "${zoneName}": duplicate record ${record.name} ${record.type}`,
      );
    }

    seen.add(key);
    records.push(record);
  }

  return { provider, records };
}

export function parseDeclaration(content: string): Declaration {
  const raw = loadYaml(content) as unknown;

  if (typeof raw !== "object" || raw === null || !("zones" in raw)) {
    throw new Error("Declaration must have a top-level 'zones' key");
  }

  const { zones } = raw as { zones: unknown };

  if (typeof zones !== "object" || zones === null) {
    throw new Error("'zones' must be an object");
  }

  const result: Declaration = { zones: {} };

  for (const [zoneName, zoneRaw] of Object.entries(
    zones as Record<string, unknown>,
  )) {
    result.zones[zoneName] = validateZone(zoneName, zoneRaw);
  }

  return result;
}

export function loadDeclarationFile(filePath: string): Declaration {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Declaration file not found: ${filePath}`);
  }

  return parseDeclaration(content);
}
