export type DnsTtl = number | "auto";

export interface NormalizedRecord {
  name: string;
  type: string;
  value: string;
  ttl: DnsTtl;
  proxied?: boolean;
}

export type FetchLike = (
  input: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

export interface CloudflareRecord {
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export interface TencentRecord {
  Name: string;
  Type: string;
  Value: string;
  TTL: number;
}

export interface TencentManagedRecord {
  recordId: number;
  name: string;
  type: string;
  value: string;
  ttl: number;
  line: string;
  updatedOn: string;
}

export const SUPPORTED_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
] as const;
export type SupportedRecordType = (typeof SUPPORTED_RECORD_TYPES)[number];

export type Provider = "cloudflare" | "tencent";

export interface FieldChange {
  from: string | number | boolean;
  to: string | number | boolean;
}

export interface RecordUpdate {
  name: string;
  type: string;
  changes: Record<string, FieldChange>;
}

export interface ZonePlanResult {
  provider: Provider;
  creates: NormalizedRecord[];
  updates: RecordUpdate[];
  deletes: NormalizedRecord[];
  skippedMultiValue: NormalizedRecord[];
}

export interface ZonePlanError {
  provider: Provider;
  error: string;
}

export interface PlanResult {
  file: string;
  generatedAt: string;
  zones: Record<string, ZonePlanResult | ZonePlanError>;
}
