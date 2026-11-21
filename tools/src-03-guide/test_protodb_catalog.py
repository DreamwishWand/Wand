"""Source-contract synthetic test fixtures. No proprietary game bytes required."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import native_guide as n
from protodb_guide_catalog import (project_entry, source_ids, archived_timestamp,
                                    archived_condition_date)
from test_protodb_static import item, vf, sf
from version_diff import compare_snapshots


def blob(kind, label, fields, **kwargs):
    return project_entry(label, kind, fields, n.wire_fields, n.text_field,
        n.int_field, n.sha, lambda key, where: {'key': key, 'where': where},
        **kwargs)


def moment(epoch):
    return vf(1, epoch)


class ProtoDbGuideCatalogTests(unittest.TestCase):
    def test_mini_event_static_dates_packed_refs_and_reward_candidates(self):
        dates = sf(2, moment(1761091200)) + vf(1, 5)
        segment = sf(1, 'WeekOne') + sf(2, moment(1761091200)) + sf(3, moment(1761696000))
        raw = (sf(1, 'Liveops.Festival_Title') + sf(2, 'Liveops.Festival_Desc')
               + sf(5, dates) + sf(6, dates) + sf(7, dates)
               + sf(8, segment)
               + sf(10, n.encode_varint(2110000001)+n.encode_varint(2110000002))
               + vf(11, 2070000001)
               + sf(12, vf(2, 40003778)+vf(5, 3)+vf(6, 1)))
        out = blob('Definitions.MiniEventData','Festival',raw,
            quest_ids={'2070000001'}, duty_ids={'2110000001'})
        self.assertEqual(out['kind'],'miniEvent')
        self.assertEqual(out['duties'],[
            {'id':'2110000001','status':'present'},
            {'id':'2110000002','status':'not_in_native_source_index'}])
        self.assertEqual(out['quests'][0]['status'],'present')
        self.assertEqual(out['archivedDateConditions']['startDate']['operator'],
                         'GreaterThanOrEqual')
        self.assertEqual(out['segments'][0]['name'],'WeekOne')
        self.assertEqual(out['featuredRewardCandidates'][0]['itemId'],'40003778')
        self.assertNotIn('activeNow',out)

    def test_floating_festival_scene_puzzles_and_reward_definitions(self):
        puzzle = (sf(1, moment(1761091200)) + sf(2, sf(2,sf(65,vf(1,10000004))))
                  + sf(10,'Assets/Puzzle') + sf(11,'Assets/PuzzleInactive'))
        raw = (sf(1, 'Liveops.Event_Title') + vf(10,1540000195)
               + sf(11, n.encode_varint(1540000202))
               + sf(20, puzzle) + sf(21, vf(1,40004651)+vf(2,2)))
        out = blob('Definitions.FloatingFestivalData','Haunted',raw,
            world_ids={'1540000195'})
        self.assertEqual(out['targetScene'],{'id':'1540000195','status':'present'})
        self.assertEqual(out['targetSubSceneIds'],['1540000202'])
        self.assertEqual(out['puzzles'][0]['imageResource'],'Assets/Puzzle')
        self.assertIn('completionConditionWireSha256',out['puzzles'][0])
        self.assertEqual(out['rewardDefinitions'][0]['configuredAmount'],2)
        self.assertNotIn('availableNow',out)

    def test_expansion_does_not_infer_owned_or_purchased(self):
        raw = (sf(1,'Liveops.Exp_Title')+sf(2,'Liveops.Exp_Desc')
               + vf(3,2001200029)+sf(4,'unlock-external')
               + sf(5, b'opaque-pack')+vf(6,1540000101)+sf(7,b'')
               + vf(8,1)+vf(9,2))
        out = blob('Definitions.ExpansionData','Expansion01',raw,
                   world_ids={'1540000101'})
        self.assertEqual(out['tagItemId'],'2001200029')
        self.assertEqual(out['villageScene']['status'],'present')
        self.assertEqual(out['entitlement'],'not_evaluated')
        self.assertEqual(len(out['iapPackDefinitionHashes']),1)
        self.assertTrue(out['showInStartMenu'])
        self.assertNotIn('owned',out)

    def test_corrupt_packed_and_duplicate_scalar_rejected(self):
        with self.assertRaises(ValueError):
            source_ids(n.wire_fields(sf(10,b'\x80')),10)
        with self.assertRaises(ValueError):
            source_ids(n.wire_fields(sf(10,b'\x80\x00')),10)
        with self.assertRaises(ValueError):
            blob('Definitions.ExpansionData','X',vf(6,10)+vf(6,11))

    def test_static_timestamp_preserves_source_provenance(self):
        result=archived_timestamp(moment(1761091200)+vf(2,123),
                                  n.wire_fields,n.int_field,n.sha)
        self.assertTrue(result['sourceUtcDateTime'].startswith('2025-'))
        self.assertEqual(result['nanos'],123)
        with self.assertRaises(ValueError):
            archived_timestamp(moment(1761091200)+vf(2,1000000000),
                               n.wire_fields,n.int_field,n.sha)

    def test_full_protodb_projector_three_new_families(self):
        from test_protodb_static import ProtoDbStaticTests
        fixture=ProtoDbStaticTests('test_static_design_and_starpath_and_missing_locales')
        fixture.setUp()
        try:
            path=fixture.origin/'protoDb.bin'
            with path.open('ab') as out:
                out.write(item('Mini','Liveops/MiniEvents','Definitions.MiniEventData',
                    sf(1,'Liveops.Foo_Title')+sf(12,vf(2,31400001))))
                out.write(item('Festival','Liveops/Floating','Definitions.FloatingFestivalData',
                    sf(1,'Liveops.Bar_Title')+vf(10,1540000001)+sf(20,sf(1,moment(1761091200)))))
                out.write(item('Expansion','Liveops/Expansions','Definitions.ExpansionData',
                    sf(1,'Liveops.Exp_Title')+vf(6,1540000001)))
            summary=fixture.run_static()
            self.assertEqual({key:summary[key] for key in
                ('miniEvents','floatingFestivals','expansions')},
                {'miniEvents':1,'floatingFestivals':1,'expansions':1})
            for filename in ('mini-events.json','floating-festivals.json','expansions.json'):
                self.assertEqual(len(json.loads((fixture.out/'guide'/filename).read_text())['records']),1)
        finally:
            fixture.doCleanups()

    def test_new_catalog_wire_diff_detected_without_false_derived_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            old,new=Path(tmp)/'old',Path(tmp)/'new'
            common={'schema':'wand.db03.native-guide@1',
                    'sources':{},'target':{'platform':'Steam','gameVersion':'1.26.1'},
                    'protoDbStatic':{'status':'STATIC_SOURCE_ONLY',
                        'miniEvents':1,'floatingFestivals':0,'expansions':0}}
            for folder in (old,new):
                (folder/'guide').mkdir(parents=True)
                (folder/'manifest.json').write_text(json.dumps(common))
                for name in ('design-challenges.json','starpath-ftue.json',
                             'floating-festivals.json','expansions.json'):
                    (folder/'guide'/name).write_text(json.dumps({'records':[]}))
            original={'id':'MiniA','nativeClass':'Definitions.MiniEventData',
                      'nativeWireSha256':'a'*64,'text':{'title':{'en':'A'}},
                      'newDerivedSchema':{'unrelated':'v1'}}
            revised={**original,'newDerivedSchema':{'unrelated':'v2'}}
            (old/'guide/mini-events.json').write_text(json.dumps({'records':[original]}))
            (new/'guide/mini-events.json').write_text(json.dumps({'records':[revised]}))
            delta=compare_snapshots(old,new)
            self.assertEqual(delta['changed'],[])
            revised['nativeWireSha256']='b'*64
            (new/'guide/mini-events.json').write_text(json.dumps({'records':[revised]}))
            delta=compare_snapshots(old,new)
            self.assertEqual(delta['changed'],[{'family':'miniEvents','id':'MiniA'}])
            self.assertEqual(delta['status'],'COMPARED')

    def test_legacy_snapshot_never_claims_removed_new_families(self):
        with tempfile.TemporaryDirectory() as tmp:
            old,new=Path(tmp)/'old',Path(tmp)/'new'
            for where in (old,new):(where/'guide').mkdir(parents=True)
            orig={'schema':'wand.db03.native-guide@1','sources':{},
                  'target':{'platform':'Steam','gameVersion':'1.26.1'},
                  'protoDbStatic':{'status':'STATIC_SOURCE_ONLY'}}
            current={**orig,'protoDbStatic':{'status':'STATIC_SOURCE_ONLY',
                'miniEvents':1,'floatingFestivals':0,'expansions':0}}
            # New parser adds catalog projections to same game source archive.
            for where,manifest in ((old,orig),(new,current)):
                (where/'manifest.json').write_text(json.dumps(manifest))
                for file in ('design-challenges.json','starpath-ftue.json'):
                    (where/'guide'/file).write_text(json.dumps({'records':[]}))
            for file,records in (('mini-events.json',[
                 {'id':'Test','nativeClass':'Definitions.MiniEventData',
                  'nativeWireSha256':'0'*64,'text':{}}]),
                 ('floating-festivals.json',[]),('expansions.json',[])):
                (new/'guide'/file).write_text(json.dumps({'records':records}))
            diff=compare_snapshots(old,new)
            self.assertEqual(diff['status'],'PARTIAL_COMPARISON')
            self.assertEqual(diff['removed'],[])
            self.assertEqual(diff['added'],[])
            self.assertEqual({f['family'] for f in diff['uncomparedFamilies']},
                {'miniEvents','floatingFestivals','expansions'})
            self.assertTrue(all(x['reason']=='static_projection_unavailable_in_previous_snapshot'
                for x in diff['uncomparedFamilies']))


if __name__=='__main__':unittest.main()
