import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_EARLY_ACCESS_FIRST_DAY,GUIDE_EARLY_ACCESS_SOURCE,
  GUIDE_OFFICIAL_HISTORICAL_EVENTS}
  from '../src/lib/guide/official-event-history.ts';
import {viewerEventDateTime} from '../src/lib/guide/viewer-event-time.ts';

test('historical calendar is bounded by the 2022 Early Access launch, not 2023 full release',()=>{
  assert.equal(GUIDE_EARLY_ACCESS_FIRST_DAY,'2022-09-06');
  assert.equal(GUIDE_OFFICIAL_HISTORICAL_EVENTS.length,18);
  const first=GUIDE_OFFICIAL_HISTORICAL_EVENTS[0];
  assert.equal(first.id,'pixar-fest-star-path-2022');
  assert.equal(first.sourceUrl,GUIDE_EARLY_ACCESS_SOURCE);
  assert.equal(first.startDay,GUIDE_EARLY_ACCESS_FIRST_DAY);
  assert.equal(first.endDayInclusive,'2022-10-11');
  assert.equal(first.kind,'starpath-history');
  const nightShow=GUIDE_OFFICIAL_HISTORICAL_EVENTS.find(row=>row.id==='the-night-show-star-path-2024');
  assert(nightShow);
  assert.equal(nightShow.startDay,'2024-10-09');
  assert.equal(nightShow.endDayInclusive,'2024-11-27');
  assert.equal(Object.hasOwn(nightShow,'officialEndUtc'),false);
  assert.equal(first.officialEndUtc,'2022-10-11T13:00:00Z');
  assert.match(viewerEventDateTime(first.officialEndUtc,'America/New_York'),/09:00 GMT-4/);
  assert.match(viewerEventDateTime(first.officialEndUtc,'Asia/Tokyo'),/22:00 GMT\+9/);
});
test('all historical entries have dated official publisher sources, no wiki dates or invented yearly reruns',()=>{
  const ids=new Set(),years=new Set();
  for(const row of GUIDE_OFFICIAL_HISTORICAL_EVENTS){
    assert(!ids.has(row.id),'duplicate official event id');ids.add(row.id);
    years.add(row.startDay.slice(0,4));
    assert(row.startDay>=GUIDE_EARLY_ACCESS_FIRST_DAY);
    assert(row.endDayInclusive>=row.startDay);
    assert.equal(new URL(row.sourceUrl).hostname,'disneydreamlightvalley.com');
    assert(!('startUtc' in row),'publication dates never imply UTC start');
    if(row.kind==='limited-event')assert(['floating','other'].includes(row.category));
  }
  assert.deepEqual([...years].sort(),['2022','2023','2024','2025','2026']);
  assert.equal(GUIDE_OFFICIAL_HISTORICAL_EVENTS.filter(row=>row.kind==='starpath-history').length,2,
    'without verified official start AND end, other historic passes remain excluded');
  const past=GUIDE_OFFICIAL_HISTORICAL_EVENTS.filter(row=>row.kind==='limited-event');
  assert(past.every(row=>row.participation==='game-clock'||row.participation==='not-verified'));
  const floating=past.find(row=>row.id==='haunted-floating-festival-2025');
  assert.equal(floating?.participation,'not-verified',
    'official dates alone do not establish that this limited island can be replayed');
});
