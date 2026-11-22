/**
 * DB-05: typed TypeScript module Worker for the Rust/WASM Save amount engine.
 * The product engine (P1G, inventory/chest patch, validation, exact copy)
 * runs only in Rust/WASM. No JavaScript Save Writer fallback.
 * Dedicated Worker owns all original bytes; only bounded receipts or an
 * explicitly requested experimental copy reach the Svelte page.
 */
import init, { WasmAmountPreview } from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {
  detectLocalSaveFormat,
  MAX_LOCAL_P1G_BYTES,
  MAX_LOCAL_JSON_BYTES
} from './save-diagnostics-worker-core.mjs';

const CHUNK = 1024 * 1024;
const MAX_COPY_BYTES = 32 * 1024 * 1024;
type InputFormat = 'auto' | 'json' | 'p1g';
type Target =
  | { kind: 'inventory'; inventoryId: string; itemId: string }
  | { kind: 'chest'; containerId: string; slotIndex: number; itemId: number };

interface PreviewReceipt {
  contract: 'wand.db05.amount-preview@1';
  changed: boolean;
  lexicalBytesPreserved: true;
  reopenVerified: boolean;
  writerAuthorized: false;
  exportAuthorized: false;
}
interface BatchPreviewReceipt {
  contract: 'wand.db05.batch-preview@1';
  changedCount: number;
  lexicalBytesPreserved: true;
  reopenVerified: true;
  writerAuthorized: false;
  exportAuthorized: false;
}
interface CopyReceipt {
  contract: 'wand.db05.experimental-copy@1';
  copyBytes: number;
  originalUnchanged: true;
  productionWriterAuthorized: false;
  independentReopenVerified: true;
  experimentalCopyOnly: true;
}
type Reply =
  | { kind: 'error' }
  | { kind: 'result'; receipt: PreviewReceipt | BatchPreviewReceipt }
  | { kind: 'copy'; bytes: Uint8Array; receipt: CopyReceipt };

interface IsolatedScope {
  onmessage: ((event: MessageEvent<unknown>) => Promise<void>) | null;
  postMessage: (message: Reply, transfer?: Transferable[]) => void;
  close: () => void;
}
const isolated = self as unknown as IsolatedScope;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const uint32 = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff;
const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9]{1,20}$/.test(v) &&
  BigInt(v) > 0n && BigInt(v) <= 18446744073709551615n;
const exact = (v: unknown, keys: readonly string[]): boolean =>
  object(v) && Object.keys(v).sort().join(',') === keys.slice().sort().join(',');

function validateTarget(raw: unknown): Target {
  if (!object(raw)) throw new TypeError('DB05_TARGET_INVALID');
  if (raw.kind === 'inventory') {
    if (!exact(raw, ['kind', 'inventoryId', 'itemId']) ||
        !validId(raw.inventoryId) || !validId(raw.itemId))
      throw new TypeError('DB05_INVENTORY_TARGET_INVALID');
    return { kind: 'inventory', inventoryId: raw.inventoryId, itemId: raw.itemId };
  }
  if (raw.kind === 'chest') {
    if (!exact(raw, ['kind', 'containerId', 'slotIndex', 'itemId']) ||
        !validId(raw.containerId) || !uint32(raw.itemId) ||
        typeof raw.slotIndex !== 'number' ||
        !Number.isInteger(raw.slotIndex) ||
        raw.slotIndex < 0 || raw.slotIndex > 1_000_000)
      throw new TypeError('DB05_CHEST_TARGET_INVALID');
    return { kind: 'chest', containerId: raw.containerId,
      slotIndex: raw.slotIndex, itemId: raw.itemId };
  }
  throw new TypeError('DB05_TARGET_KIND_INVALID');
}


interface BatchEdit { target: Target; expected: number; replacement: number }
function validateBatchEdits(raw: unknown): BatchEdit[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 16)
    throw new TypeError('DB05_BATCH_COUNT_INVALID');
  const seen = new Set<string>();
  return raw.map((value: unknown) => {
    if (!exact(value, ['target', 'expected', 'replacement']) || !object(value) ||
        !uint32(value.expected) || !uint32(value.replacement) ||
        value.expected === value.replacement)
      throw new TypeError('DB05_BATCH_AMOUNT_INVALID');
    const target = validateTarget(value.target);
    const key = JSON.stringify(target);
    if (seen.has(key)) throw new TypeError('DB05_BATCH_TARGET_DUPLICATED');
    seen.add(key);
    return {target, expected:value.expected, replacement:value.replacement};
  });
}

let started = false;
isolated.onmessage = async ({ data }: MessageEvent<unknown>): Promise<void> => {
  if (started) return;
  started = true;
  const input = object(data) ? data : null;
  const bytes = input?.bytes;
  let response: Reply = { kind: 'error' };
  let rust: WasmAmountPreview | null = null;
  let exported: Uint8Array | null = null;
  try {
    const exporting = input?.command === 'export-existing-amount-copy' ||
      input?.command === 'export-batch-amount-copy';
    const batch = input?.command === 'preview-batch-amounts' ||
      input?.command === 'export-batch-amount-copy';
    const expectedKeys = batch
      ? (exporting
        ? ['command', 'format', 'bytes', 'edits', 'allowExperimentalCopy']
        : ['command', 'format', 'bytes', 'edits'])
      : (exporting
        ? ['command', 'format', 'bytes', 'target', 'expected', 'replacement',
           'allowExperimentalCopy']
        : ['command', 'format', 'bytes', 'target', 'expected', 'replacement']);
    if (!input || !exact(input, expectedKeys) ||
        !['preview-existing-amount', 'export-existing-amount-copy',
          'preview-batch-amounts', 'export-batch-amount-copy'].includes(
          String(input.command)) ||
        (exporting && input.allowExperimentalCopy !== true) ||
        !['auto', 'json', 'p1g'].includes(String(input.format)) ||
        !(bytes instanceof Uint8Array) ||
        (!batch && (!uint32(input.expected) || !uint32(input.replacement))))
      throw new TypeError('DB05_WORKER_COMMAND_INVALID');

    const edits = batch ? validateBatchEdits(input.edits) : null;
    const plan = edits === null ? null : JSON.stringify(edits);
    const target = batch ? null : validateTarget(input.target);
    const requestedFormat = input.format as InputFormat;
    const format: Exclude<InputFormat, 'auto'> =
      requestedFormat === 'auto' ? detectLocalSaveFormat(bytes) : requestedFormat;
    if (format === 'p1g'
      ? (bytes.byteLength < 16 ||
         bytes.byteLength > MAX_LOCAL_P1G_BYTES ||
         bytes.byteLength % 16 !== 0)
      : (bytes.byteLength < 1 || bytes.byteLength > MAX_LOCAL_JSON_BYTES))
      throw new TypeError('DB05_WORKER_SIZE_INVALID');

    await init(wasmUrl);
    rust = new WasmAmountPreview(format);
    for (let i = 0; i < bytes.byteLength; i += CHUNK)
      rust.append_chunk(bytes.subarray(i, i + CHUNK));
    rust.finish_open();

    if (exporting) {
      const length = plan !== null
        ? rust.prepare_batch_copy(plan)
        : target?.kind === 'inventory'
          ? rust.prepare_inventory_copy(
            target.inventoryId, target.itemId, input.expected as number, input.replacement as number)
          : rust.prepare_chest_copy(
            target!.containerId, target!.slotIndex, target!.itemId,
            input.expected as number, input.replacement as number);
      if (!Number.isSafeInteger(length) ||
          length < 1 || length > MAX_COPY_BYTES)
        throw new TypeError('DB05_COPY_SIZE_INVALID');

      exported = new Uint8Array(length);
      for (let i = 0; i < length; i += CHUNK) {
        const part: Uint8Array = rust.take_copy_chunk(Math.min(CHUNK, length - i));
        if (!(part instanceof Uint8Array) ||
            part.byteLength !== Math.min(CHUNK, length - i))
          throw new TypeError('DB05_COPY_CHUNK_INVALID');
        exported.set(part, i);
        part.fill(0);
      }
      response = {
        kind: 'copy', bytes: exported,
        receipt: {
          contract: 'wand.db05.experimental-copy@1',
          copyBytes: length, originalUnchanged: true,
          productionWriterAuthorized: false,
          independentReopenVerified: true,
          experimentalCopyOnly: true
        }
      };
    } else {
      const raw = plan !== null
        ? rust.preview_batch(plan)
        : target?.kind === 'inventory'
          ? rust.preview_inventory(
            target.inventoryId, target.itemId, input.expected as number, input.replacement as number)
          : rust.preview_chest(
            target!.containerId, target!.slotIndex, target!.itemId,
            input.expected as number, input.replacement as number);
      const candidate: unknown = JSON.parse(raw);
      if (batch) {
        if (!object(candidate) || !exact(candidate, [
          'contract','changedCount','lexicalBytesPreserved','reopenVerified',
          'writerAuthorized','exportAuthorized'
        ]) || candidate.contract !== 'wand.db05.batch-preview@1' ||
            candidate.changedCount !== edits?.length ||
            candidate.lexicalBytesPreserved !== true ||
            candidate.reopenVerified !== true ||
            candidate.writerAuthorized !== false ||
            candidate.exportAuthorized !== false)
          throw new TypeError('DB05_BATCH_UNTRUSTED_RECEIPT');
        response = {
          kind:'result',
          receipt:{
            contract:'wand.db05.batch-preview@1',
            changedCount:edits!.length,
            lexicalBytesPreserved:true,
            reopenVerified:true,
            writerAuthorized:false,
            exportAuthorized:false
          }
        };
      } else {
      if (!exact(candidate, [
        'contract', 'changed', 'lexicalBytesPreserved', 'reopenVerified',
        'writerAuthorized', 'exportAuthorized'
      ]) || !object(candidate) ||
          candidate.contract !== 'wand.db05.amount-preview@1' ||
          typeof candidate.changed !== 'boolean' ||
          candidate.lexicalBytesPreserved !== true ||
          typeof candidate.reopenVerified !== 'boolean' ||
          candidate.writerAuthorized !== false ||
          candidate.exportAuthorized !== false)
        throw new TypeError('DB05_UNTRUSTED_RUST_RECEIPT');
      response = {
        kind: 'result',
        receipt: {
          contract: 'wand.db05.amount-preview@1',
          changed: candidate.changed,
          lexicalBytesPreserved: true,
          reopenVerified: candidate.reopenVerified,
          writerAuthorized: false,
          exportAuthorized: false
        }
      };
      }
    }
  } catch {
    // Never forward private source fields, Rust errors, IDs, or save contents.
  } finally {
    rust?.close();
    rust?.free();
    if (bytes instanceof Uint8Array && bytes.byteLength) bytes.fill(0);
  }

  if (response.kind === 'copy') {
    // Explicit user action permits transferred edited bytes; never clone.
    isolated.postMessage(response, [response.bytes.buffer as ArrayBuffer]);
  } else {
    if (exported instanceof Uint8Array && exported.byteLength) exported.fill(0);
    isolated.postMessage(response);
  }
  isolated.close();
};
