/**
 * pnpm extract <file> [--effort low|medium|high|xhigh|max] [--show-bank-details]
 *
 * Reads one supplier document with Claude (doc 07) and prints the extraction as JSON on stdout,
 * and the model, stop reason, tokens, cost and latency of each API call on stderr, so
 * `pnpm --silent extract invoice.pdf > invoice.json` gives clean JSON. Remit-to account and
 * routing numbers are masked to their last 4 digits unless --show-bank-details is given.
 *
 * Each run is billed to ANTHROPIC_API_KEY, read from the environment or from .env.
 * Exit codes: 0 extracted, 1 extraction failed, 2 usage error.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  formatSummary,
  maskBankDetails,
} from "../src/integrations/claude/cli-output";
import {
  EXTRACTION_EFFORT,
  EXTRACTION_EFFORTS,
  type ExtractionEffort,
} from "../src/integrations/claude/config";
import { createExtractor } from "../src/integrations/claude/extract";
import { describeFailure } from "../src/integrations/claude/failures";
import { detectInput } from "../src/integrations/claude/input";

const USAGE =
  "Usage: pnpm extract <file> [--effort low|medium|high|xhigh|max] [--show-bank-details]";

function printError(text: string): void {
  process.stderr.write(`${text}\n`);
}

function isEffort(value: string): value is ExtractionEffort {
  return (EXTRACTION_EFFORTS as readonly string[]).includes(value);
}

/** Loads .env, but only when the environment doesn't set the key: `ANTHROPIC_API_KEY=` means none. */
function loadEnvFile(): boolean {
  if (process.env.ANTHROPIC_API_KEY !== undefined) {
    return true;
  }
  try {
    process.loadEnvFile();
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parse>;
  try {
    args = parse();
  } catch {
    printError(USAGE);
    return 2;
  }
  const [file, ...extra] = args.positionals;
  if (args.values.help === true || file === undefined || extra.length > 0) {
    printError(USAGE);
    return 2;
  }
  const effort = args.values.effort ?? EXTRACTION_EFFORT;
  if (!isEffort(effort)) {
    printError(`Unknown effort "${effort}". ${USAGE}`);
    return 2;
  }
  if (!loadEnvFile()) {
    printError("Couldn't read the .env file.");
    return 2;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(file);
  } catch {
    printError(`Can't read the file ${file}.`);
    return 2;
  }

  const detected = detectInput(bytes);
  if (!detected.ok) {
    printError(describeFailure(detected.failure));
    return 1;
  }

  const extractor = createExtractor({ apiKey: process.env.ANTHROPIC_API_KEY });
  const outcome = await extractor.extract(detected.input, { effort });
  if (outcome.calls.length > 0) {
    printError(formatSummary(outcome.calls));
  }
  if (!outcome.ok) {
    printError(
      `Extraction failed (${outcome.failure.reason}): ${describeFailure(outcome.failure)}`,
    );
    return 1;
  }
  const json =
    args.values["show-bank-details"] === true
      ? outcome.raw
      : maskBankDetails(outcome.raw);
  process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
  return 0;
}

function parse() {
  return parseArgs({
    allowPositionals: true,
    options: {
      effort: { type: "string" },
      "show-bank-details": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
}

process.exitCode = await main();
