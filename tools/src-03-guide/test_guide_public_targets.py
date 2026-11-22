"""Source-free contract tests for exact typed quest target publication."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SRC=Path(__file__).with_name('guide_public_targets.py')
spec=importlib.util.spec_from_file_location('guide_public_targets',SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class PublicQuestTargetsTest(unittest.TestCase):
    def test_direct_alternative_and_configured_amount_stay_distinct(self):
        obj={'schema':'wand.db03.mission-items@1',
             'amount':{'kind':'range','min':2,'max':5},
             'selectors':[{'role':'target','kind':'selector','mode':'itemList',
               'itemCandidates':[{'id':'30000031','role':'alternative','generatorKind':'item'},
                                 {'id':'30000033','role':'alternative','generatorKind':'item'}]}]}
        row=mod.export_target(obj)
        self.assertEqual(row['amount'],{'kind':'range','min':2,'max':5})
        self.assertEqual(row['selectors'][0]['mode'],'itemList')
        self.assertEqual([x['role'] for x in row['selectors'][0]['candidates']],['alternative']*2)
    def test_dynamic_filter_must_not_be_invented_as_item(self):
        row=mod.export_target({'schema':'wand.db03.mission-items@1',
              'amount':{'kind':'opaque'},'selectors':[{'role':'target','kind':'selector',
                  'mode':'filterGenerator','itemCandidates':[]}]})
        self.assertEqual(row['selectors'][0]['candidates'],[])
        self.assertEqual(row['selectors'][0]['mode'],'filterGenerator')
        self.assertEqual(row['amount'],{'kind':'dynamic'})
    def test_bad_candidate_id_amount_and_role_rejected(self):
        base={'schema':'wand.db03.mission-items@1',
              'selectors':[{'role':'item','kind':'selector','mode':'item',
               'itemCandidates':[{'id':'0','role':'direct'}]}]}
        with self.assertRaisesRegex(ValueError,'BAD_NATIVE_ITEM_ID'):mod.export_target(base)
        base['selectors'][0]['itemCandidates'][0]={'id':'30000031','role':'required'}
        with self.assertRaisesRegex(ValueError,'BAD_CANDIDATE_ROLE'):mod.export_target(base)
        base['selectors'][0]['itemCandidates'][0]['role']='direct'
        base['amount']={'kind':'value','value':-1}
        with self.assertRaisesRegex(ValueError,'BAD_AMOUNT'):mod.export_target(base)
    def test_private_archive_requires_pinned_exact_sha(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'fake.zip';p.write_bytes(b'not an owner-original guide bundle')
            with self.assertRaisesRegex(ValueError,'BUNDLE_SHA_MISMATCH'):
                mod.build(p,{'schema':'wand.db03.public-guide-quests@1',
                             'target':{'platform':'Steam','gameVersion':'1.26.2'},
                             'provenance':{'missionFullFileSha256':mod.PUBLIC_MISSION_SHA},
                             'counts':{'quests':733},'quests':[]})
if __name__=='__main__':unittest.main()
