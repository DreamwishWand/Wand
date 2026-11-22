"""No owner-private liveops cache bytes are checked in for this test suite."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
from starpath_cache_version_audit import (make,source,SCHEMA,SOURCES)

def fixture():
    tasks=[{'InternalName':'Task%02d'%i,
            'Description':'earlier label %s'%i,
            'CurrencyReward':10,'Objective':{'PickUp':{'TargetAmount':i}}}
           for i in range(1,122)]
    # Same nested source reward structure; counts come from all original slots.
    old={
      'OnlineId':'HauntingElegance2026','Title':'Haunting Elegance',
      'Version':12500,'MinGameVersion':'1.25','StartDate':{'Date':'2026-09-23T13:00:00Z'},
      'LastUpdateTimestamp':{'Date':'2026-09-28T00:34:48Z'},
      'RewardsPages':[{'Rewards':[{'ItemID':10000000+i,'Price':10} for i in range(34)]}],
      'BonusRewards':{'Pages':[{'Rewards':[{'ItemID':20000000+i} for i in range(9)]}]},
      'VaultRewards':{'Data':{'Rewards':[{'ItemID':30000000+i,'AlternateItemID':31400174}
                                          for i in range(7)]}},
      'TaskConfig':{'Tasks':tasks},
      'WeeklyTasksConfig':{'WeeklyTasks':[]},
      'PremiumPassPrice':{'Amount':3300},
    }
    new=copy.deepcopy(old)
    new['Version']=12602
    new['LastUpdateTimestamp']={'Date':'2026-11-22T02:18:20Z'}
    new['PlatformFilter']={'IncludeAllExcept':{'PlatformsToExclude':['AppleArcade']}}
    for i,latest in [(14,'updated label 15'),(63,'updated label 64'),
                     (99,'updated label 100')]:
        new['TaskConfig']['Tasks'][i]['Description']=latest
    extra={'OnlineId':'Seafaring2026','Version':12602}
    return {'HauntingElegance2026':old},{'HauntingElegance2026':new,'Seafaring2026':extra}

class OriginalCacheRevisionTests(unittest.TestCase):
    def compare(self,a,b):
        def spoof(filename,*args):
            return a if args[0]=='1.25.0' else b
        with patch('starpath_cache_version_audit.source',side_effect=spoof):
            return make('/owner-private/early','/owner-private/late')

    def test_complete_original_cross_version_invariants(self):
        a,b=fixture()
        result=self.compare(a,b)
        self.assertEqual(result['schema'],SCHEMA)
        self.assertEqual(result['matchedSeason']['rewardSlotsWithIdenticalFullSourceDefinition'],50)
        self.assertEqual(result['matchedSeason']['dailyTasksWithSameIdAndNonDescriptionFields'],121)
        self.assertEqual([x['taskId'] for x in result['matchedSeason']['descriptionEdits']],
                         ['Task15','Task64','Task100'])
        self.assertEqual(result['onlyInLaterSnapshot'],['Seafaring2026'])
        self.assertEqual(result['unseenHistoricalSeasonIdsVerified'],0)
        self.assertFalse(result['evidence']['historicalSeasonCatalogComplete'])
        self.assertFalse(result['evidence']['liveStatusVerified'])

    def test_reward_mutation_fails_closed(self):
        a,b=fixture()
        b['HauntingElegance2026']['VaultRewards']['Data']['Rewards'][0]['AlternateItemID']=0
        with self.assertRaisesRegex(ValueError,'REWARD_SLOT_DEFINITION_CHANGED'):
            self.compare(a,b)

    def test_quest_goal_change_is_not_a_description_edit(self):
        a,b=fixture()
        b['HauntingElegance2026']['TaskConfig']['Tasks'][0]['Objective']['PickUp']['TargetAmount']=100
        with self.assertRaisesRegex(ValueError,'TASK_FIELDS_OTHER_THAN_DESCRIPTION_CHANGED'):
            self.compare(a,b)

    def test_new_season_cannot_be_misidentified_as_older_source(self):
        a,b=fixture()
        b['HauntingElegance2026']['TaskConfig']['Tasks'][0]['InternalName']='SomeOtherTask'
        with self.assertRaisesRegex(ValueError,'TASK_ID_OR_ORDER_CHANGED'):
            self.compare(a,b)
        a,b=fixture()
        a['PixarFest2022']={'OnlineId':'PixarFest2022'}
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_BATTLEPASS_CACHE_MEMBERS'):
            self.compare(a,b)

    def test_unexpected_static_changes_not_silently_accepted(self):
        a,b=fixture()
        b['HauntingElegance2026']['PremiumPassPrice']['Amount']=3500
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_NON_TASK_FIELDS_CHANGED'):
            self.compare(a,b)
        a,b=fixture()
        b['HauntingElegance2026']['PlatformFilter']['IncludeAllExcept']['PlatformsToExclude']=['Android']
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_PLATFORM_FILTER_CHANGE'):
            self.compare(a,b)

    def test_forged_source_bytes_rejected_before_parsing(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'fake.dat'
            p.write_bytes(json.dumps({'Data':{}}).encode('utf-8'))
            with self.assertRaisesRegex(ValueError,'BATTLEPASS_ORIGINAL_SOURCE_MISMATCH'):
                source(p,*SOURCES[0])
            with self.assertRaisesRegex(ValueError,'SOURCE_FILE_MISSING_OR_INVALID'):
                source(Path(folder)/'not-a-file',*SOURCES[1])

if __name__=='__main__':
    unittest.main()
