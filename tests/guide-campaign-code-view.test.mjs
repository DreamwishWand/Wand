import test from 'node:test';
import assert from 'node:assert/strict';
import {codeWindowState,campaignCodeEntries} from '../src/lib/guide/campaign-code-view.ts';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
const now=Date.parse('2026-11-25T00:00:00Z');
test('published dates are not live validity; civil boundaries are conservative',()=>{
 assert.equal(codeWindowState('2026-06-03',null,now),'unknown');
 assert.equal(codeWindowState(null,null,now,true),'no-expiry-published');
 assert.equal(codeWindowState('2024-10-09','2024-11-20T14:00:00Z',now),'ended');
 assert.equal(codeWindowState('2026-12-03',null,now),'scheduled');
 assert.equal(codeWindowState('2026-11-24T00:00:00Z','2026-11-26T00:00:00Z',now),'within-published-window');
 assert.equal(codeWindowState('2026-11-24','2026-11-25',now),'unknown');
});
test('reuse official source data, exclude third-party archive tokens and preserve exact spelling',()=>{
 const entries=campaignCodeEntries(OFFICIAL_CAMPAIGNS,[],now);
 assert.equal(entries.filter(e=>e.state==='no-expiry-published').length,8);
 assert.equal(entries.find(e=>e.code==='DDVPRIDE2026')?.state,'unknown');
 assert.equal(entries.find(e=>e.code==='DDV2024OOOOO')?.state,'ended');
 assert(!entries.some(e=>e.code==='DDVPRIDE25'));
 assert.equal(new Set(entries.map(e=>e.code)).size,entries.length);
});
test('published community evidence supplements exact code without overwriting official facts',()=>{
 const report={id:'report-1',kind:'code',title:'Report',code:'DDVPRIDE2026',schedule:{end:{precision:'day',value:'2025-01-01'}},rewards:[{itemId:'123',name:'Reported item',quantity:2}],language:'en',confidenceLabel:'Community report',sourceUrl:'https://example.com/'};
 const extra={...report,id:'report-2',code:'ddvpride2026',sourceUrl:'javascript:alert(1)'};
 const entries=campaignCodeEntries(OFFICIAL_CAMPAIGNS,[report,extra],now);
 const row=entries.find(e=>e.code==='DDVPRIDE2026');
 assert.equal(row.state,'unknown');
 assert.equal(row.sourceKind,'official');
 assert.equal(row.report.rewards[0].itemId,'123');
 assert.equal(entries.find(e=>e.code==='ddvpride2026').sourceUrl,null);
 assert.equal(entries.find(e=>e.code==='ddvpride2026').sourceKind,'community');
});
