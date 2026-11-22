#!/usr/bin/env node
/**
 * Final architecture guard (fast, source-only).
 * Svelte/TypeScript UI + typed Module Web Worker + Rust/WASM product Save Core.
 *
 * Current pre-existing JavaScript readers are migration debt, NOT precedent
 * for new product JS modules. Python/Node CLI extraction tools outside src/
 * are intentionally out of scope. wasm-bindgen generated JS glue is allowed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function requireContract(ok, message) {
  if (!ok) throw new Error('WAND_FINAL_ARCHITECTURE: ' + message);
}

const newProductJs = path =>
  /^src\/(?:lib|routes)\/.+\.(?:mjs|cjs|js|jsx)$/i.test(path) &&
  !/\/wasm\/(?:[^/]+\/)?pkg\//i.test(path);

function addedFiles(baseSha) {
  if (!baseSha) return [];
  requireContract(/^[0-9a-f]{40}$/.test(baseSha), 'invalid PR base commit');
  const raw = execFileSync('git', [
    'diff', '--name-only', '-z', '--diff-filter=A',
    baseSha, 'HEAD', '--', 'src'
  ]);
  return raw.toString('utf8').split('\0').filter(Boolean);
}

function verifyMigratedSaveWorker() {
  const path = 'src/lib/save/save-amount-preview.worker.ts';
  requireContract(existsSync(path), 'typed DB-05 Worker missing');
  requireContract(!existsSync('src/lib/save/save-amount-preview.worker.mjs'),
    'old JavaScript DB-05 Worker still present');
  const worker = readFileSync(path, 'utf8');
  const page = readFileSync('src/routes/save/preview/+page.svelte', 'utf8');
  requireContract(worker.includes('WasmAmountPreview'),
    'DB-05 Worker does not call the Rust/WASM engine');
  requireContract(worker.includes('type Target') &&
    worker.includes('type Reply') &&
    worker.includes('validateTarget'),
    'DB-05 TypeScript Worker request/reply contract missing');
  requireContract(page.includes('save-amount-preview.worker.ts') &&
    !page.includes('save-amount-preview.worker.mjs'),
    'Svelte preview still targets an old JS Worker');
}

try {
  const base = process.env.ARCH_BASE_SHA ?? '';
  const additions = addedFiles(base);
  const forbidden = additions.filter(newProductJs);
  requireContract(forbidden.length === 0,
    'new product JavaScript files are prohibited (use TS/Rust): ' +
    forbidden.join(', '));
  verifyMigratedSaveWorker();
  console.log(JSON.stringify({
    contract: 'wand.final-architecture@1',
    result: 'pass',
    newProductJsModules: forbidden.length,
    saveWorker: 'typescript-worker/rust-wasm',
    legacyJsCodecFullyMigrated: false,
    worldJsAdapterFullyMigrated: false,
    legacyModulesRemainMigrationDebt: true,
    sourceOnlyCheck: true,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
