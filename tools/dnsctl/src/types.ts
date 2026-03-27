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
