/**
 * `.env.example` is public (CLAUDE.md rule 11): every secret stays empty, and every key says
 * where to get it. The names are the ones recorded for P0-1 in docs/decisions.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lines = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim());

const assignments = lines.flatMap((line, index) => {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  return match ? [{ key: match[1] ?? "", value: match[2] ?? "", index }] : [];
});

/** Values that aren't secrets and have exactly one right answer on a local copy. */
const NON_SECRET_DEFAULTS: Record<string, string> = {
  QBO_REDIRECT_URI: "http://localhost:3000/api/qbo/callback",
  QBO_ENVIRONMENT: "sandbox",
};

describe(".env.example", () => {
  it("has only comments, blank lines and KEY=value lines", () => {
    for (const line of lines) {
      expect(
        line === "" || line.startsWith("#") || /^[A-Z][A-Z0-9_]*=/.test(line),
      ).toBe(true);
    }
  });

  it("uses the names recorded for P0-1, once each", () => {
    const keys = assignments.map(({ key }) => key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "ANTHROPIC_API_KEY",
        "QBO_CLIENT_ID",
        "QBO_CLIENT_SECRET",
        "QBO_REDIRECT_URI",
        "QBO_ENVIRONMENT",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves every secret empty", () => {
    for (const { key, value } of assignments) {
      expect(value, key).toBe(NON_SECRET_DEFAULTS[key] ?? "");
    }
  });

  it("explains every key in a comment above it", () => {
    for (const { key, index } of assignments) {
      let i = index - 1;
      while (i >= 0 && /^[A-Z]/.test(lines[i] ?? "")) i--;
      expect(lines[i]?.startsWith("#"), key).toBe(true);
    }
  });
});
