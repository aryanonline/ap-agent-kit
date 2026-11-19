/**
 * `pnpm extract` end to end, for the paths that never reach the API: usage errors, a file it
 * can't read, and no API key. The real API calls are covered by src/integrations/claude with a
 * fake API; this checks the command's wiring, exit codes and output streams.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CANARY = "CANARY-9d1e-invoice-content";

const dir = mkdtempSync(join(tmpdir(), "line-beagle-extract-"));
const pdf = join(dir, "invoice.pdf");
const text = join(dir, "invoice.txt");
writeFileSync(pdf, `%PDF-1.7\n% ${CANARY}\n%%EOF\n`);
writeFileSync(text, `Invoice 1001 ${CANARY}\n`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(...args: string[]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/extract.ts", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        // An empty key means "no key": .env isn't read, and nothing is sent.
        ANTHROPIC_API_KEY: "",
        // Belt and braces: if anything did try the API, it would hit a closed local port.
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
        ANTHROPIC_LOG: "debug",
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// Each test starts Node with tsx, which can take a few seconds on a cold CI runner.
describe("pnpm extract", { timeout: 30_000 }, () => {
  it.each([[[]], [["a.pdf", "b.pdf"]], [["--nope", "a.pdf"]], [["--help"]]])(
    "prints the usage and exits 2 for %j",
    (args) => {
      const { status, stdout, stderr } = run(...args);
      expect(status).toBe(2);
      expect(stderr).toContain("Usage: pnpm extract <file>");
      expect(stdout).toBe("");
    },
  );

  it("rejects an unknown effort", () => {
    const { status, stderr } = run(pdf, "--effort", "extreme");
    expect(status).toBe(2);
    expect(stderr).toContain('Unknown effort "extreme"');
  });

  it("exits 2 for a file that doesn't exist", () => {
    const { status, stderr } = run(join(dir, "missing.pdf"));
    expect(status).toBe(2);
    expect(stderr).toContain("Can't read the file");
  });

  it("exits 1 for a file that isn't a PDF or an image, without printing it", () => {
    const { status, stdout, stderr } = run(text);
    expect(status).toBe(1);
    expect(stderr).toContain("isn't a PDF, PNG, JPEG or WEBP");
    expect(stdout).toBe("");
    expect(stderr).not.toContain(CANARY);
  });

  it("exits 1 with the fix when no API key is set, without printing the document", () => {
    const { status, stdout, stderr } = run(pdf);
    expect(status).toBe(1);
    expect(stderr).toContain("Extraction failed (no_api_key)");
    expect(stderr).toContain("Add ANTHROPIC_API_KEY to your .env file");
    expect(stdout).toBe("");
    expect(stderr).not.toContain(CANARY);
  });
});
