import type {
  NormalizedRecord,
  PlanResult,
  RecordUpdate,
  ZonePlanError,
  ZonePlanResult,
} from "./types";

function formatRecordLine(
  prefix: string,
  record: NormalizedRecord,
): string {
  const proxiedSuffix = record.proxied ? "  proxied" : "";
  return `    ${prefix} ${record.name}  ${record.type}  ${record.value}  ttl=${record.ttl}${proxiedSuffix}`;
}

function formatUpdateLines(update: RecordUpdate): string[] {
  const lines: string[] = [];
  lines.push(`    ~ ${update.name}  ${update.type}`);

  for (const [field, change] of Object.entries(update.changes)) {
    lines.push(`      ${field}: ${change.from} -> ${change.to}`);
  }

  return lines;
}

function isZonePlanError(
  zone: ZonePlanResult | ZonePlanError,
): zone is ZonePlanError {
  return "error" in zone;
}

function formatPlanText(result: PlanResult): string {
  const lines: string[] = [];

  for (const [zoneName, zone] of Object.entries(result.zones)) {
    lines.push(`Zone: ${zoneName} (${zone.provider})`);

    if (isZonePlanError(zone)) {
      lines.push(`  Error: ${zone.error}`);
      lines.push("");
      continue;
    }

    const hasChanges =
      zone.creates.length > 0 ||
      zone.updates.length > 0 ||
      zone.deletes.length > 0;

    if (!hasChanges) {
      lines.push("  No changes");
      lines.push("");
      continue;
    }

    if (zone.creates.length > 0) {
      lines.push("");
      lines.push("  Create:");
      for (const record of zone.creates) {
        lines.push(formatRecordLine("+", record));
      }
    }

    if (zone.updates.length > 0) {
      lines.push("");
      lines.push("  Update:");
      for (const update of zone.updates) {
        lines.push(...formatUpdateLines(update));
      }
    }

    if (zone.deletes.length > 0) {
      lines.push("");
      lines.push("  Delete:");
      for (const record of zone.deletes) {
        lines.push(formatRecordLine("-", record));
      }
    }

    lines.push("");
    lines.push(
      `  Summary: ${zone.creates.length} to create, ${zone.updates.length} to update, ${zone.deletes.length} to delete`,
    );
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatPlanOutput(
  result: PlanResult,
  format: "text" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  return formatPlanText(result);
}
