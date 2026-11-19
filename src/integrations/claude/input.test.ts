import { describe, expect, it } from "vitest";
import {
  checkInput,
  detectInput,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  type ExtractionInput,
} from "./input";

function bytes(...parts: (string | number[])[]): Uint8Array {
  const all = parts.flatMap((part) =>
    typeof part === "string"
      ? Array.from(part, (character) => character.charCodeAt(0))
      : part,
  );
  return Uint8Array.from(all);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("detectInput", () => {
  it.each<[string, Uint8Array, Record<string, string>]>([
    ["a PDF", bytes("%PDF-1.7\n1 0 obj"), { kind: "pdf" }],
    [
      "a PDF with junk before its header",
      bytes("\n\r junk ", "%PDF-1.4"),
      { kind: "pdf" },
    ],
    [
      "a PNG",
      bytes(PNG_SIGNATURE, [0, 0, 0, 13]),
      { kind: "image", mediaType: "image/png" },
    ],
    [
      "a JPEG",
      bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]),
      { kind: "image", mediaType: "image/jpeg" },
    ],
    [
      "a WEBP",
      bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "),
      { kind: "image", mediaType: "image/webp" },
    ],
  ])("recognises %s", (_name, data, expected) => {
    const outcome = detectInput(data);
    expect(outcome).toEqual({ ok: true, input: { ...expected, data } });
  });

  it.each<[string, Uint8Array, string]>([
    ["an empty file", new Uint8Array(), "empty"],
    ["plain text", bytes("Invoice 1001\nTotal 45.47"), "unknown_type"],
    ["a GIF", bytes("GIF89a"), "unknown_type"],
    ["a HEIC photo", bytes([0, 0, 0, 0x18], "ftypheic"), "unknown_type"],
    [
      "a RIFF file that isn't WEBP",
      bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "),
      "unknown_type",
    ],
    [
      "a PDF header past the first 1,024 bytes",
      bytes(" ".repeat(1025), "%PDF-1.7"),
      "unknown_type",
    ],
    [
      "a truncated PNG signature",
      bytes(PNG_SIGNATURE.slice(0, 4)),
      "unknown_type",
    ],
  ])("rejects %s", (_name, data, detail) => {
    expect(detectInput(data)).toEqual({
      ok: false,
      failure: { reason: "unsupported_file", detail },
    });
  });

  it("finds a PDF header that ends exactly at the end of the window", () => {
    expect(detectInput(bytes(" ".repeat(1024), "%PDF-")).ok).toBe(true);
  });

  it("checks the size of what it recognises", () => {
    const tooLarge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    tooLarge.set([0xff, 0xd8, 0xff]);
    expect(detectInput(tooLarge)).toEqual({
      ok: false,
      failure: { reason: "unsupported_file", detail: "too_large" },
    });
  });
});

describe("checkInput", () => {
  it.each<[string, ExtractionInput, string | null]>([
    [
      "a PDF at the limit",
      { kind: "pdf", data: new Uint8Array(MAX_PDF_BYTES) },
      null,
    ],
    [
      "a PDF over the limit",
      { kind: "pdf", data: new Uint8Array(MAX_PDF_BYTES + 1) },
      "too_large",
    ],
    ["an empty PDF", { kind: "pdf", data: new Uint8Array() }, "empty"],
    [
      "an image at the limit",
      {
        kind: "image",
        mediaType: "image/png",
        data: new Uint8Array(MAX_IMAGE_BYTES),
      },
      null,
    ],
    [
      "an image over the limit",
      {
        kind: "image",
        mediaType: "image/png",
        data: new Uint8Array(MAX_IMAGE_BYTES + 1),
      },
      "too_large",
    ],
    [
      "an empty image",
      { kind: "image", mediaType: "image/webp", data: new Uint8Array() },
      "empty",
    ],
    ["text", { kind: "text", text: "Invoice 1001" }, null],
    ["blank text", { kind: "text", text: " \t\n" }, "empty"],
  ])("%s", (_name, input, detail) => {
    expect(checkInput(input)).toEqual(
      detail === null ? null : { reason: "unsupported_file", detail },
    );
  });

  it("keeps images within the API's 10 MB base64 limit", () => {
    const base64Length = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
    expect(base64Length).toBeLessThanOrEqual(10_000_000);
  });
});
