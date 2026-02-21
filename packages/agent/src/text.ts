export function truncateByChars(text: string, maxChars: number, suffix = "..."): string {
  if (text.length <= maxChars) {
    return text;
  }

  const sliceLength = Math.max(0, maxChars - suffix.length);
  return `${text.slice(0, sliceLength)}${suffix}`;
}

export function truncateByBytes(text: string, maxBytes: number, marker = "[output truncated]"): string {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return text;
  }

  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n${marker}`;
}

export function firstMeaningfulLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

export function listPreview(value: string, maxItems = 5): string {
  const items = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return "none";
  }
  if (items.length <= maxItems) {
    return items.join(", ");
  }
  return `${items.slice(0, maxItems).join(", ")} (+${items.length - maxItems} more)`;
}
