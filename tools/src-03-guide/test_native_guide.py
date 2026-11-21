import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
import native_guide as db


def vf(n, v):
    return db.encode_varint((n << 3) | 0) + db.encode_varint(v)


def sf(n, s):
    value = s if isinstance(s, bytes) else s.encode('utf-8')
    return db.encode_varint((n << 3) | 2) + db.encode_varint(len(value)) + value


def frame(key, data):
    return db.encode_varint(key) + db.encode_varint(len(data)) + data


def loc_entry(k, v):
    return sf(1, sf(1, k) + sf(2, v))


class NativeGuideTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.game = self.root / 'game'
        self.src = self.game / 'ddv_Data' / 'StreamingAssets'
        (self.src / 'itemlist').mkdir(parents=True)
        (self.src / 'Localization').mkdir()
        self.out = self.root / 'out'
        self.char = 10000001
        self.quest_group = 2070200001
        self.quest = 2070000001
        self.scene = 1540000001
        sample = {
            'quests': [
                (1, vf(1, self.quest) + sf(2, 'Story!MyQuest') + sf(3, 'Story/MyQuest.Story!MyQuest_DisplayName') +
                 vf(7, self.char) + vf(13, self.quest_group) +
                 sf(40, sf(11, 'Story/MyQuest.Story!Step01_StepDescription'))),
                (200001, vf(1, self.quest_group) + sf(2, 'Story!Group'))],
            'characters': [(1, vf(1, self.char) + sf(2, 'Game!Guide') + sf(3, 'Character.Game!Guide_DisplayName') + vf(14, self.scene))],
            'worlds': [(1, vf(1, self.scene) + sf(2, 'Town!Main') + sf(3, 'Scene.Town!Main_DisplayName'))],
            'stories': [(1, vf(1, 200000001) + sf(2, 'Story!Main'))],
            'duties': [(1, vf(1, 2110000001) + sf(2, 'CraftThings') + sf(7, 'DutyAch.CraftThings_Description'))],
            'events': [(1, vf(1, 2010000001) + sf(2, 'DailyEvent'))],
            'conditions': [(1, vf(1, 2130000001) + sf(2, 'QuestComplete'))],
            'conditionalEvents': [(1, vf(1, 1520000001) + sf(2, 'Trigger'))],
            'tutorials': [(1, vf(1, 2080000001) + sf(2, 'FishingTutorial'))],
        }
        for family, seq in sample.items():
            stem = db.SOURCES[family]
            (self.src / 'itemlist' / (stem+'.json')).write_bytes(b''.join(frame(*x) for x in seq))
        for locale, text in [('en-US', 'The Guide'), ('ja', '案内人')]:
            with zipfile.ZipFile(self.src / 'Localization' / ('LocDB_'+locale+'.zip'), 'w') as z:
                z.writestr('Character.locbin', loc_entry('Game!Guide_DisplayName', text))
                z.writestr('Story/MyQuest.locbin', loc_entry('Story!MyQuest_DisplayName',
                                  'Guide Quest' if locale == 'en-US' else '案内クエスト') +
                           loc_entry('Story!Step01_StepDescription', 'Visit a friend' if locale == 'en-US' else '友達に会う'))
                z.writestr('DutyAch.locbin', loc_entry('CraftThings_Description', 'Craft something'))
        self.items = self.root / 'items.jsonl'
        self.items.write_text('{"itemId":30000031}\n', encoding='utf-8')

    def test_extract_and_locales_and_relations(self):
        db.extract(self.game, self.out, '1.26.1', 'Steam', self.items)
        q = json.loads((self.out / 'guide/quests.json').read_text())['records'][0]
        self.assertEqual(q['id'], str(self.quest))
        self.assertEqual(q['names'], {'en': 'Guide Quest', 'ja': '案内クエスト'})
        self.assertEqual(q['characterId'], str(self.char))
        self.assertEqual(q['nativeStepCount'], 1)
        self.assertEqual(len(q['nativeWireSha256']), 64)
        self.assertEqual(len(q['steps'][0]['nativeWireSha256']), 64)
        self.assertEqual(q['steps'][0]['localizedText']['Story/MyQuest.Story!Step01_StepDescription']['ja'], '友達に会う')
        rows = json.loads((self.out / 'database/relations.json').read_text())['relations']
        self.assertEqual(sum(r['status'] == 'resolved' for r in rows), 3)
        self.assertEqual(sum(r['status'] == 'unresolved' for r in rows), 0)
        manifest = json.loads((self.out / 'manifest.json').read_text())
        self.assertEqual(manifest['counts']['quests'], 2)
        self.assertEqual(manifest['missionRecordKinds'], {'mission':1,'questGroup':1})
        kinds=json.loads((self.out / 'database/mission-record-kinds.json').read_text())['records']
        self.assertEqual({x['id']:x['recordKind'] for x in kinds}[str(self.quest_group)],'questGroup')
        self.assertEqual(manifest['status'], 'PARTIAL')
        self.assertIn('ja', manifest['localizationSources'])

    def test_diff_and_no_source_mutation(self):
        db.extract(self.game, self.out, '1.26.1', 'Steam')
        prior = (self.src / 'itemlist' / 'DutyAch.json').read_bytes()
        self.assertGreater(len(prior), 0)
        path = self.src / 'itemlist' / 'DutyAch.json'
        path.write_bytes(frame(1, vf(1, 2110000001) + sf(2, 'DifferentDuty')))
        out2 = self.root / 'out2'
        db.extract(self.game, out2, '1.26.2', 'Steam', previous=self.out)
        diff = json.loads((out2 / 'diff.json').read_text())
        self.assertIn({'family': 'duties', 'id': '2110000001'}, diff['changed'])
        self.assertNotEqual(path.read_bytes(), prior)

    def test_structured_conditions_friendship_rewards_and_reward_diff(self):
        (self.src / 'Condition').mkdir()
        (self.src / 'Condition' / 'QuestComplete.json').write_text(json.dumps({
            'ID': 2130000001, 'Name': 'QuestComplete',
            'Conditions': {'Conditions': [{'MissionStepStatus': {
                'Mission': self.quest, 'StepID': 1, 'Status': 'Completed'}}]}}
        ), encoding='utf-8')
        path = self.src / 'friendship_levels_default.json'
        path.write_text(json.dumps([{'Level': 1, 'XP': 40,
               'CompletedReward': [{'ID': 80000000, 'Amount': 5}]}]), encoding='utf-8')
        db.extract(self.game, self.out, '1.26.1', 'Steam', self.items)
        self.assertEqual(len(json.loads((self.out / 'guide/rewards.json').read_text())['records']), 1)
        cond = json.loads((self.out / 'guide/conditions.json').read_text())['records'][0]
        self.assertEqual(cond['structuredDefinition']['Conditions']['Conditions'][0]
                         ['MissionStepStatus']['Mission'], self.quest)
        rels = json.loads((self.out / 'database/relations.json').read_text())['relations']
        self.assertTrue(any(r['fromFamily'] == 'conditions' and r['toId'] == str(self.quest)
                            and r['status'] == 'resolved' for r in rels))
        report = json.loads((self.out / 'manifest.json').read_text())
        self.assertEqual(report['structuredDefinitions']['conditions'], 1)
        self.assertEqual(report['counts']['rewards'], 1)
        self.assertEqual(json.loads((self.out / 'diff.json').read_text())['status'],
                         'BASELINE_NO_PREVIOUS')
        path.write_text(json.dumps([{'Level': 1, 'XP': 40,
               'CompletedReward': [{'ID': 80000000, 'Amount': 10}]}]), encoding='utf-8')
        out2 = self.root / 'out2'
        db.extract(self.game, out2, '1.26.2', 'Steam', self.items, previous=self.out)
        change = json.loads((out2 / 'diff.json').read_text())
        self.assertIn({'family': 'rewards', 'id': 'default:1:CompletedReward:0'},
                      change['changed'])
        self.assertEqual(change['status'], 'COMPARED')

    def test_opaque_wire_change_appears_in_version_diff(self):
        db.extract(self.game, self.out, '1.26.1', 'Steam')
        path = self.src / 'itemlist' / 'DutyAch.json'
        path.write_bytes(frame(1, vf(1, 2110000001) + sf(2, 'CraftThings') +
                               sf(7, 'DutyAch.CraftThings_Description') + vf(29, 42)))
        out2 = self.root / 'out2'
        db.extract(self.game, out2, '1.26.2', 'Steam', previous=self.out)
        result = json.loads((out2 / 'diff.json').read_text())
        self.assertIn({'family': 'duties', 'id': '2110000001'}, result['changed'])

    def test_typed_nested_objective_conditions_and_reward_ranges(self):
        # Field numbers are from Steam 1.26.1 IL2CPP proto definitions.
        # ConditionOneOf.MissionCompleted=255, SubConditions=10,
        # MissionStepStatus=285; MissionObjectiveData.TalkToCharacter=270.
        leaf = sf(255, vf(1, self.quest_group))
        status = sf(285, vf(1, self.quest_group) + vf(2, 17) + vf(3, 5))
        nested = sf(10, vf(1, 1) + sf(2, status))
        conditions = sf(20, sf(2, leaf) + sf(2, nested))
        objective = vf(8, 8) + sf(9, 'TalkToMerlin') + sf(270, b'')
        sub = (vf(1, 17) + sf(2, 'Step17') + sf(50, objective) +
               sf(50, vf(8, 9) + sf(9, 'UnlockMerlin') +
                  sf(280, vf(1, self.char))))
        step = vf(15, 3) + sf(16, 'Group03') + sf(20, sub)
        reward = sf(62, sf(1, vf(1, 15) + vf(2, 30)) +
                        sf(3, vf(1, 80000000) + sf(2, vf(1, 50) + vf(2, 80))))
        fields = (vf(1, self.quest) + sf(2, 'Story!MyQuest') +
                  sf(3, 'Story/MyQuest.Story!MyQuest_DisplayName') + conditions +
                  vf(9, 4) + vf(15, 2) + sf(40, step) + reward)
        group = vf(1, self.quest_group) + sf(2, 'Story!Group')
        (self.src / 'itemlist' / 'Mission.json').write_bytes(
            frame(1, fields) + frame(200001, group))
        db.extract(self.game, self.out, '1.26.1', 'Steam')
        row = next(r for r in json.loads((self.out / 'guide/quests.json').read_text())['records'] if r['id'] == str(self.quest))
        structured = row['structured']
        self.assertEqual(structured['questMeta']['missionType'], 'Realm')
        self.assertEqual(structured['questMeta']['uiCategory'], 'Story')
        ast = structured['conditions']['availableConditions']
        self.assertEqual(ast['operator'], 'AND')
        self.assertEqual(ast['conditions'][0]['type'], 'MissionCompleted')
        self.assertEqual(ast['conditions'][1]['nested']['operator'], 'OR')
        self.assertEqual(ast['conditions'][1]['nested']['conditions'][0]['status'], 'NotCompleted')
        step = structured['stepsDetailed'][0]
        self.assertEqual(step['stepId'], 3)
        obj = step['subSteps'][0]['objectives'][0]
        self.assertEqual(obj['type'], 'TalkToCharacter')
        self.assertEqual(obj['objectiveId'], 8)
        self.assertEqual(structured['rewardsDecoded']['friendshipOverride'], {'min':15,'max':30})
        self.assertEqual(structured['rewardsDecoded']['currency'][0],
                         {'currencyId':'80000000','amountMin':50,'amountMax':80})
        relations=json.loads((self.out / 'database/relations.json').read_text())['relations']
        edges=[r for r in relations if r.get('relationKind')=='static_condition_reference']
        self.assertEqual(len(edges),2)
        obj_edges=[r for r in relations if r.get('relationKind')=='static_objective_reference']
        self.assertEqual(len(obj_edges), 1)
        self.assertEqual(obj_edges[0]['toId'], str(self.char))
        self.assertEqual(obj_edges[0]['predicate'], 'UnlockCharacter.character')
        self.assertTrue(all(r['status']=='resolved' for r in edges+obj_edges))

    def test_item_selector_links_are_candidates_not_required_items(self):
        # Source-backed oneof: CraftItem.Target -> ItemSelector.Item ->
        # MissionItemGenerator.Item -> GeneratorItem.Item.
        item_id=30000031
        selector=sf(1,sf(1,vf(1,item_id)))
        qty=sf(1,vf(1,3))
        objective=vf(8,19)+sf(9,'CraftGoal')+sf(130,sf(1,selector)+sf(2,qty))
        sub=sf(50,objective)
        step=sf(20,sub)
        quest=(vf(1,self.quest)+sf(2,'Story!MyQuest')+sf(3,
            'Story/MyQuest.Story!MyQuest_DisplayName')+sf(40,step))
        group=vf(1,self.quest_group)+sf(2,'Story!Group')
        (self.src/'itemlist'/'Mission.json').write_bytes(
            frame(1,quest)+frame(200001,group))
        db.extract(self.game,self.out,'1.26.1','Steam',self.items)
        data=json.loads((self.out/'database/item-objective-links.json').read_text())
        self.assertEqual(len(data['links']),1)
        link=data['links'][0]
        self.assertEqual(link['itemId'],str(item_id))
        self.assertEqual(link['candidateRole'],'direct')
        self.assertEqual(link['indexMembership'],'present')
        self.assertEqual(link['amountDefinition']['value'],3)
        self.assertIn('NOT all simultaneously required items',data['meaning'])
        manifest=json.loads((self.out/'manifest.json').read_text())
        self.assertEqual(manifest['itemObjectiveSelectorLinks'],1)
        self.assertEqual(manifest['itemObjectiveUniqueCandidateIds'],1)

    def test_condition_ast_index_preserves_boolean_tree(self):
        conditional = sf(20, sf(2, sf(10, vf(1,1)+sf(2,sf(65,vf(1,self.char))))))
        mission = vf(1,self.quest)+sf(2,'Story!MyQuest')+conditional+sf(40,b'')
        group = vf(1,self.quest_group)+sf(2,'Story!Group')
        (self.src/'itemlist'/'Mission.json').write_bytes(
            frame(1,mission)+frame(200001,group))
        db.extract(self.game,self.out,'1.26.1','Steam')
        index=json.loads((self.out/'database/condition-ast.json').read_text())
        self.assertEqual(index['evaluation'],'not_evaluated_static_source_only')
        self.assertEqual(len(index['records']),1)
        node=index['records'][0]['availableConditions']['conditions'][0]['nested']
        self.assertEqual(node['operator'],'OR')
        self.assertEqual(node['conditions'][0]['characterId'],str(self.char))
        manifest=json.loads((self.out/'manifest.json').read_text())
        self.assertEqual(manifest['conditionAstMissions'],1)
        self.assertEqual(manifest['recognizedConditionKinds'],2)

    def test_reject_bad_frames_and_inputs(self):
        with self.assertRaises(ValueError):
            db.varint(b'\x80\x00', 0)
        with self.assertRaises(ValueError):
            list(db.native_frames(frame(1, vf(1, 2000002)) + frame(2, vf(1, 2000004))))
        with self.assertRaises(ValueError):
            db.extract(self.game, self.game / 'output', '1.26.1', 'Steam')
        with self.assertRaises(ValueError):
            db.locbin_decode(loc_entry('A', '1') + loc_entry('A', '2'))


if __name__ == '__main__':
    unittest.main()
