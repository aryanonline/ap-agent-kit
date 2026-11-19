/**
 * What the extraction call accepts (doc 07): PDFs as document blocks, PNG, JPEG and WEBP as
 * image blocks (E2-2 AC1), and plain text (an invoice sent as an HTML email body, converted to
 * text by the intake job). The type comes from the file's first bytes, never from its name.
 */
import type { ExtractionFailure, UnsupportedFileDetail } from "./failures";

/** E2-2 AC1: attachments up to 20 MB. The API takes requests of up to 128 MB. */
export const MAX_PDF_BYTES = 20_000_000;

/**
 * The API takes up to 10 MB of base64 per image (vision docs, checked 2026-11-19). Base64 is
 * 4/3 of the raw size, so 7.5 MB of image is the most that fits.
 */
export const MAX_IMAGE_BYTES = 7_500_000;

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export type ExtractionInput =
  | { readonly kind: "pdf"; readonly data: Uint8Array }
  | {
      readonly kind: "image";
      readonly mediaType: ImageMediaType;
      readonly data: Uint8Array;
    }
  | { readonly kind: "text"; readonly text: string };

export type UnsupportedFile = Extract<
  ExtractionFailure,
  { reason: "unsupported_file" }
>;

export type DetectInputOutcome =
  | { readonly ok: true; readonly input: ExtractionInput }
  | { readonly ok: false; readonly failure: UnsupportedFile };

/** A PDF may have up to 1,024 bytes of junk before its `%PDF-` header. */
const PDF_HEADER_WINDOW = 1024;

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0) {
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

const PDF = ascii("%PDF-");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");

function isPdf(bytes: Uint8Array): boolean {
  const last = Math.min(PDF_HEADER_WINDOW, bytes.length - PDF.length);
  for (let at = 0; at <= last; at++) {
    if (startsWith(bytes, PDF, at)) {
      return true;
    }
  }
  return false;
}

function unsupported(detail: UnsupportedFileDetail): UnsupportedFile {
  return { reason: "unsupported_file", detail };
}

/**
 * Empty input, or input over its size limit. `extract` checks this too, so a caller that builds
 * an `ExtractionInput` itself can't skip it.
 */
export function checkInput(input: ExtractionInput): UnsupportedFile | null {
  switch (input.kind) {
    case "pdf":
      if (input.data.length === 0) return unsupported("empty");
      return input.data.length > MAX_PDF_BYTES
        ? unsupported("too_large")
        : null;
    case "image":
      if (input.data.length === 0) return unsupported("empty");
      return input.data.length > MAX_IMAGE_BYTES
        ? unsupported("too_large")
        : null;
    case "text":
      return input.text.trim() === "" ? unsupported("empty") : null;
  }
}

/** Reads a file's type from its first bytes, then checks its size. */
export function detectInput(bytes: Uint8Array): DetectInputOutcome {
  let input: ExtractionInput;
  if (bytes.length === 0) {
    return { ok: false, failure: unsupported("empty") };
  } else if (isPdf(bytes)) {
    input = { kind: "pdf", data: bytes };
  } else if (startsWith(bytes, PNG)) {
    input = { kind: "image", mediaType: "image/png", data: bytes };
  } else if (startsWith(bytes, JPEG)) {
    input = { kind: "image", mediaType: "image/jpeg", data: bytes };
  } else if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    input = { kind: "image", mediaType: "image/webp", data: bytes };
  } else {
    return { ok: false, failure: unsupported("unknown_type") };
  }
  const problem = checkInput(input);
  return problem ? { ok: false, failure: problem } : { ok: true, input };
}
