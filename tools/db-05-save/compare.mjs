#!/usr/bin/env node
/**
 * DB-05 private report-only CLI. Inputs: two sanitized DB-05 ingest summaries.
 * Output: structural comparison of known public historical field paths only.
 * No raw save file, decoder, Writer, or import/export of game content.
 */
import { readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { compareRedactedSaveWitnesses } from '../../src/lib/save/redacted-witness.mjs';

const LIMIT_BYTES = 1_000_000;
function fail(message) { throw new TypeError(message); }
function args(argv) {
  if (argv.length !== 6) fail('USAGE: --previous SUMMARY --current SUMMARY --out NEW_FILE');
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i], value = argv[i + 1];
    if (!['--previous','--current','--out'].includes(option) || options.has(option) ||
        typeof value !== 'string' || !value) fail('INVALID_COMPARISON_ARGUMENTS');
    options.set(option, resolve(value));
  }
  if (options.size !== 3) fail('REQUIRED_COMPARISON_ARGUMENT_MISSING');
  return options;
}
function ensureOutsideGit(path) {
  let parent = dirname(path);
  while (true) {
    if (existsSync(join(parent,'.git'))) fail('PRIVATE_REPORT_OUTPUT_INSIDE_GIT');
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
}
function readSummary(path) {
  if (!statSync(path).isFile() || statSync(path).size > LIMIT_BYTES) {
    fail('PRIVATE_SUMMARY_SIZE_OR_TYPE');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function runComparison(argv) {
  const options = args(argv);
  const previous = options.get('--previous');
  const current = options.get('--current');
  const output = options.get('--out');
  if (output === previous || output === current || existsSync(output)) fail('PRIVATE_OUTPUT_MUST_BE_NEW');
  ensureOutsideGit(output);
  const parent = dirname(output);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) fail('PRIVATE_OUTPUT_PARENT_MISSING');
  const report = compareRedactedSaveWitnesses(readSummary(previous), readSummary(current));
  // An exclusive-create write is mandatory; never overwrite evidence or originals.
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try { runComparison(process.argv.slice(2)); }
  catch (error) {
    // Generic failure marker; never echo potentially sensitive file paths/values.
    process.stderr.write('DB05_PRIVATE_COMPARE_FAILED: ' +
      (error instanceof TypeError ? error.message : 'INVALID_OR_UNAVAILABLE_PRIVATE_INPUT') + '\n');
    process.exitCode = 1;
  }
}
