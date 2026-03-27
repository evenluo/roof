import type {
  CloudflareRecord,
  NormalizedRecord,
  TencentRecord,
} from "../types";

function normalizeRecordName(zoneName: string, recordName: string): string {
  if (recordName === zoneName) {
    return "@";
  }

  const suffix = `.${zoneName}`;
  if (recordName.endsWith(suffix)) {
    return recordName.slice(0, -suffix.length);
  }

  return recordName;
}

export function normalizeCloudflareRecord(
  zoneName: string,
  record: CloudflareRecord,
): NormalizedRecord {
  return {
    name: normalizeRecordName(zoneName, record.name),
    type: record.type,
    value: record.content,
    ttl: record.ttl === 1 ? "auto" : record.ttl,
    ...(typeof record.proxied === "boolean" ? { proxied: record.proxied } : {}),
  };
}

export function normalizeTencentRecord(
  record: TencentRecord,
): NormalizedRecord {
  return {
    name: record.Name,
    type: record.Type,
    value: record.Value,
    ttl: record.TTL,
  };
}

export function normalizeRecordCollection(
  records: NormalizedRecord[],
): NormalizedRecord[] {
  return [...records].sort((left, right) => {
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }

    return left.value.localeCompare(right.value);
  });
}
