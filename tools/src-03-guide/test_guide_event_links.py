"""Offline synthetic contract: event links are definitions, not player outcomes."""
import json
import tempfile
import unittest
from pathlib import Path

from guide_event_links import project_event_links, SCHEMA

TARGET = {'gameVersion':'1.26.1', 'platform':'Steam'}
FAMILIES = (
    ('miniEvents','mini-events.json','Definitions.MiniEventData'),
    ('floatingFestivals','floating-festivals.json','Definitions.FloatingFestivalData'),
    ('expansions','expansions.json','Definitions.ExpansionData'),
)


def record(identifier, native_class, **data):
    return {'id':identifier, 'nativeClass':native_class, 'nativeWireSha256':'a'*64,
            'source':{'file':'ddv_Data/StreamingAssets/protoDb.bin','sha256':'b'*64},
            **data}


class CatalogLinkTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out=Path(self.tmp.name)
        (self.out/'guide').mkdir()
        (self.out/'database').mkdir()
        self.datasets={
            'miniEvents':[record('M','Definitions.MiniEventData',
                duties=[{'id':'21100001','status':'present'}],
                quests=[{'id':'20700001','status':'present'}],
                featuredRewardCandidates=[{'itemId':'30100001','sourceWireSha256':'c'*64}])],
            'floatingFestivals':[record('F','Definitions.FloatingFestivalData',
                targetScene={'id':'15400001','status':'present'},
                targetSubSceneIds=['15400002'],
                rewardDefinitions=[{'itemId':'30200001','sourceWireSha256':'d'*64}])],
            'expansions':[record('BaseGame','Definitions.ExpansionData',
                villageScene={'id':'15400001','status':'present'},tagItemId='2001200028')],
        }
        self.indexes={'quests':{'20700001'},'duties':{'21100001'},
                      'worlds':{'15400001'},'items':{'30100001'}}
        self.save()

    def save(self):
        for family, filename, _ in FAMILIES:
            (self.out/'guide'/filename).write_text(json.dumps({'schema':'synthetic',
                'target':TARGET,'family':family,'records':self.datasets[family]}),encoding='utf8')

    def run_projection(self, supplied=True, status='STATIC_SOURCE_ONLY'):
        from native_guide import save
        return project_event_links(self.out,TARGET,self.indexes,supplied,status,save)

    def test_eight_source_typed_categories_and_index_provenance(self):
        r=self.run_projection()
        self.assertEqual(r['links'],8)
        doc=json.loads((self.out/'database/guide-event-links.json').read_text())
        self.assertEqual(doc['schema'],SCHEMA)
        self.assertEqual(len(doc['counts']['byRelationKind']),8)
        by_type={row['relationKind']:row for row in doc['links']}
        self.assertEqual(by_type['static_mini_event_quest_reference']['toFamily'],'quests')
        self.assertEqual(by_type['static_mini_event_duty_reference']['targetIndexMembership'],
                         'present_in_native_source_index')
        self.assertEqual(by_type['static_festival_target_subscene_reference']['targetIndexMembership'],
                         'not_in_native_source_index')
        self.assertEqual(by_type['static_mini_event_reward_candidate']['targetIndexMembership'],
                         'present_in_optional_partial_index')
        self.assertEqual(by_type['static_festival_reward_candidate']['targetIndexMembership'],
                         'not_in_optional_partial_index')
        self.assertNotIn('rewardGranted',str(doc))
        self.assertNotIn('activeNow',str(doc))

    def test_no_optional_index_is_unchecked_not_absent_item(self):
        self.run_projection(False)
        doc=json.loads((self.out/'database/guide-event-links.json').read_text())
        self.assertTrue(all(x['targetIndexMembership']=='unchecked_optional_item_index'
            for x in doc['links'] if x['toFamily']=='items'))

    def test_missing_protodb_source_produces_no_false_empty_catalog(self):
        result=self.run_projection(status='not_present')
        self.assertEqual(result['status'],'source_not_available')
        self.assertFalse((self.out/'database/guide-event-links.json').exists())

    def test_stale_source_membership_rejected(self):
        self.datasets['miniEvents'][0]['quests'][0]['status']='not_in_native_source_index'
        self.save()
        with self.assertRaisesRegex(ValueError,'STALE_PROJECTED_MEMBERSHIP'):
            self.run_projection()

    def test_wrong_version_rejected(self):
        wrong=json.loads((self.out/'guide/mini-events.json').read_text())
        wrong['target']['gameVersion']='1.26.2'
        (self.out/'guide/mini-events.json').write_text(json.dumps(wrong))
        with self.assertRaisesRegex(ValueError,'TARGET_OR_FAMILY_MISMATCH'):
            self.run_projection()

    def test_duplicate_native_key_rejected(self):
        self.datasets['miniEvents'].append(self.datasets['miniEvents'][0].copy())
        self.save()
        with self.assertRaisesRegex(ValueError,'DUPLICATE_SOURCE_KEY'):
            self.run_projection()

    def test_invalid_reward_reference_rejected(self):
        self.datasets['floatingFestivals'][0]['rewardDefinitions'][0]['itemId']='bad-id'
        self.save()
        with self.assertRaisesRegex(ValueError,'INVALID_NUMERIC_REFERENCE'):
            self.run_projection()

    def test_invalid_source_sha_rejected(self):
        self.datasets['expansions'][0]['source']['sha256']='short'
        self.save()
        with self.assertRaisesRegex(ValueError,'UNVERIFIED_SOURCE'):
            self.run_projection()

    def test_missing_expected_projection_rejected(self):
        (self.out/'guide/expansions.json').unlink()
        with self.assertRaisesRegex(ValueError,'MISSING_OR_OVERSIZED_PROJECTION'):
            self.run_projection()


if __name__=='__main__':
    unittest.main()
