import type {
  ApplyResult,
  NormalizedRecord,
  RecordUpdate,
  ZoneApplyError,
  ZoneApplyResult,
} from "./types";

function formatRecordLine(prefix: string, record: NormalizedRecord): string {
  const proxiedSuffix = record.proxied ? "  proxied" : "";
  return `    ${prefix} ${record.name}  ${record.type}  ${record.value}  ttl=${record.ttl}${proxiedSuffix}`;
}

function formatUpdateLines(update: RecordUpdate): string[] {
  const lines: string[] = [`    ~ ${update.name}  ${update.type}`];
  for (const [field, change] of Object.entries(update.changes)) {
    lines.push(`      ${field}: ${change.from} -> ${change.to}`);
  }
  return lines;
}

function isZoneApplyError(
  zone: ZoneApplyResult | ZoneApplyError,
): zone is ZoneApplyError {
  return "error" in zone;
}

function formatApplyText(result: ApplyResult): string {
  const lines: string[] = [];

  for (const [zoneName, zone] of Object.entries(result.zones)) {
    lines.push(`Zone: ${zoneName} (${zone.provider})`);

    if (isZoneApplyError(zone)) {
      lines.push(`  Error: ${zone.error}`);
      lines.push("");
      continue;
    }

    const hasChanges =
      zone.created.length > 0 ||
      zone.updated.length > 0 ||
      zone.deleted.length > 0;

    if (!hasChanges && zone.skippedMultiValue.length === 0 && zone.errors.length === 0) {
      lines.push("  No changes applied");
      lines.push("");
      continue;
    }

    if (zone.created.length > 0) {
      lines.push("");
      lines.push("  Created:");
      for (const record of zone.created) {
        lines.push(formatRecordLine("+", record));
      }
    }

    if (zone.updated.length > 0) {
      lines.push("");
      lines.push("  Updated:");
      for (const update of zone.updated) {
        lines.push(...formatUpdateLines(update));
      }
    }

    if (zone.deleted.length > 0) {
      lines.push("");
      lines.push("  Deleted:");
      for (const record of zone.deleted) {
        lines.push(formatRecordLine("-", record));
      }
    }

    if (zone.skippedMultiValue.length > 0) {
      lines.push("");
      lines.push("  Skipped (multi-value):");
      for (const record of zone.skippedMultiValue) {
        lines.push(formatRecordLine("?", record));
      }
    }

    if (zone.errors.length > 0) {
      lines.push("");
      lines.push("  Errors:");
      for (const err of zone.errors) {
        lines.push(`    ${err.operation} ${err.record.name} ${err.record.type}: ${err.error}`);
      }
    }

    if (hasChanges) {
      lines.push("");
      lines.push(
        `  Summary: ${zone.created.length} created, ${zone.updated.length} updated, ${zone.deleted.length} deleted`,
      );
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatApplyOutput(
  result: ApplyResult,
  format: "text" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  return formatApplyText(result);
}
