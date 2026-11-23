import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UI_LANGUAGES} from '../src/lib/ui/preferences.ts';
import {historyExtraCopy} from '../src/lib/ui/history-extra-copy.ts';
import {
  operationIssueView,reportOperationIssue,resolveOperationIssue,acknowledgeOperationIssue
} from '../src/lib/ui/operation-issues.ts';

test('incident log distinguishes open, read, and resolved without retaining user input',()=>{
  let snapshot;
  const unwatch=operationIssueView.subscribe(value=>snapshot=value);
  assert.equal(snapshot.hasOpen,false);
  const id=reportOperationIssue('save','save-file-rejected');
  assert.equal(snapshot.entries.length,1);
  assert.equal(snapshot.hasOpen,true);
  assert.equal(snapshot.entries[0].code,'save-file-rejected');
  assert.equal(snapshot.entries[0].area,'save');
  assert.equal(reportOperationIssue('save','save-file-rejected'),id);
  assert.equal(snapshot.entries.length,1,'duplicate active errors should not flood the history');
  acknowledgeOperationIssue(id);
  assert.equal(snapshot.hasOpen,false);
  assert.equal(snapshot.entries[0].state,'acknowledged');
  const again=reportOperationIssue('save','save-file-rejected');
  assert.notEqual(id,again);
  assert.equal(snapshot.hasOpen,true);
  resolveOperationIssue('save','save-file-rejected');
  assert.equal(snapshot.hasOpen,false);
  assert.ok(snapshot.entries.every(entry=>entry.state==='resolved'));
  assert.equal(snapshot.entries.length,2,'resolved issues must remain in history');
  unwatch();
});

test('all eight languages include history issue labels without using raw file content',()=>{
  for(const {code} of UI_LANGUAGES){
    const copy=historyExtraCopy(code);
    for(const value of [copy.saveTab,copy.issuesButton,copy.acknowledge,copy.acknowledged,copy.resolved]){
      assert.ok(value.trim(),code);
    }
    for(const kind of ['save-file-rejected','save-read-invalid','collection-history-stale','collection-history-failed']){
      assert.ok(copy.issueTitle[kind].trim(),code+' '+kind);
      assert.ok(copy.issueDetail[kind].trim(),code+' '+kind);
    }
  }
});

test('header only shows error trigger when open and history opens at route-specific tab',()=>{
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/lib/ui/themes.css',import.meta.url),'utf8');
  for(const snippet of [
    '{#if $operationIssueView.hasOpen}',
    'on:click={openIssueHistory}',
    'function defaultHistoryArea():HistoryArea',
    "service==='collection'?'collection':service==='world'?'world'",
    "service==='save'?'save':'collection'",
    "historyArea='save'",
    'historyExtra.issueTitle[row.issue.code]',
    'acknowledgeOperationIssue(row.issue.id)',
    "disabled={service!=='collection'||$historyView.busy"
  ])assert.ok(layout.includes(snippet),snippet);
  assert.ok(css.includes('left:50%;top:50%;transform:translate(-50%,-50%)'));
  assert.ok(css.includes('@media(max-width:640px)'));
});
