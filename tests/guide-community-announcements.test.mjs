import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {announcementProvider,announcementDate,announcementSourceUrl,isPointAnnouncement} from '../src/lib/guide/community-announcements.ts';
import {announcementCopy} from '../src/lib/guide/community-announcement-copy.ts';
import {guideTimelineWindow,guideAnnouncementMarker} from '../src/lib/guide/event-timeline.ts';
test('unconnected provider, civil date, exact timezone and source URL',()=>{
 assert.equal(get(announcementProvider),null);
 assert.deepEqual(announcementDate('2026-12-02','','+09:00'),{precision:'day',value:'2026-12-02'});
 assert.deepEqual(announcementDate('2026-12-02','23:00','+09:00'),{precision:'instant',value:'2026-12-02T14:00:00.000Z'});
 assert.equal(announcementDate('','','+00:00'),undefined);
 assert.throws(()=>announcementDate('2026-02-31','','+00:00'));
 assert.throws(()=>announcementSourceUrl('javascript:alert(1)'));
 assert.equal(isPointAnnouncement('update'),true);
 assert.equal(isPointAnnouncement('drops'),false);
});
test('point, period and unknown date projections stay distinct',()=>{
 const range=guideTimelineWindow(Date.parse('2026-11-24T00:00:00Z'),5,0,'Asia/Tokyo');
 const start=announcementDate('2026-12-02','','+00:00');
 const end=announcementDate('2026-12-09','','+00:00');
 assert.equal(guideAnnouncementMarker({},false,range),null);
 assert.equal(guideAnnouncementMarker({start},true,range).point,true);
 const marker=guideAnnouncementMarker({start,end},false,range);
 assert.equal(marker.point,false);
 assert(Math.abs(marker.width-8/35*100)<0.001);
 assert.equal(guideAnnouncementMarker({start:end,end:start},false,range),null);
});
test('eight UI locales and all seven categories',()=>{
 for(const lang of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']){
  const c=announcementCopy(lang);
  assert.equal(Object.values(c.kinds).filter(Boolean).length,7);
  assert(c.correction&&c.showCalendar&&c.share);
 }
});
