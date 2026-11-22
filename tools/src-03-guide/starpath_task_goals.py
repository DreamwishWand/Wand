"""Project public scalar Star Path goals from a single source-pinned Steam cache.

Only numeric requirements and original season/task/kind identifiers are emitted.
Filter ASTs, character/item targets, UUIDs, raw tasks and private original bytes
must never appear in output or be committed to Git.
Usage: python starpath_task_goals.py /PRIVATE/battlepasses.dat /PUBLIC/starpath-goals-2026-11-22.json
"""
import argparse
import hashlib
import json
from pathlib import Path

SOURCE_SHA = '4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14'
SOURCE_BYTES = 186442
SCHEMA = 'wand.db03.starpath-goals@1'
SIMPLE = {
    'PickUp': ('AmountToCollect.Value.Value', 'items'),
    'StartDiscussion': ('TargetAmount.Value.Value', 'discussions'),
    'DressUp': ('AmountToWear.Value.Value', 'changes'),
    'PetCompanion': ('TargetAmount.Value.Value', 'interactions'),
    'MineMineral': ('TargetAmount.Value.Value', 'items'),
    'CatchFish': ('ConditionType.Amount.AmountToCatch.Value.Value', 'fish'),
    'ConsumeItem': ('ItemAmount.Value.Value', 'items'),
    'TakePicture': ('AmountOfPictures.Value.Value', 'photos'),
    'GardeningHarvest': ('Amount.Value.Value', 'items'),
    'CraftItem': ('AmountToCraft.Value.Value', 'items'),
    'PurchaseItem': ('ItemToPurchaseAmount.Value.Value', 'items'),
    'HangoutWithCharacter': ('AmountOfMinutes.Value.Value', 'minutes'),
    'CookMeal': ('AmountToCook.Value.Value', 'meals'),
    'SellItem': ('ItemToGiveAmount.Value.Value', 'items'),
    'WaterPlant': ('Amount.Value.Value', 'waterings'),
    'CollectCurrency': ('TargetAmount.Value.Value', 'currency'),
    'RoyalDuties': ('TargetAmount.Value.Value', 'duties'),
    'GiftToCharacter': ('TargetAmount.Value.Value', 'gifts'),
    'FeedCritter': ('TargetAmount.Value.Value', 'feedings'),
    'BoutiqueChallenge': ('AmountToComplete.Value.Value', 'challenges'),
    'EatMeal': ('ItemAmount.Value.Value', 'meals'),
    'DigTile': ('TargetAmount.Value.Value', 'diggings'),
    'ServeRestaurantOrder': ('Amount.Value.Value', 'orders'),
}


def scalar(obj, path):
    for key in path.split('.'):
        if not isinstance(obj, dict) or key not in obj:
            raise ValueError('GOAL_FIELD_UNAVAILABLE ' + path)
        obj = obj[key]
    if isinstance(obj, bool) or not isinstance(obj, int) or not (1 <= obj <= 10**7):
        raise ValueError('GOAL_NUMBER_INVALID ' + path)
    return obj


def project(source, expected_sha=SOURCE_SHA, expected_bytes=SOURCE_BYTES):
    if (not isinstance(source, bytes) or len(source) != expected_bytes
            or hashlib.sha256(source).hexdigest() != expected_sha):
        raise ValueError('SOURCE_FINGERPRINT')
    root = json.loads(source)
    if not isinstance(root, dict) or set(root) != {'Data'} or not isinstance(root['Data'], dict):
        raise ValueError('SOURCE_SHAPE')
    if set(root['Data']) != {'HauntingElegance2026', 'Seafaring2026'}:
        raise ValueError('SOURCE_SEASONS')
    seasons = []
    for season_id in sorted(root['Data']):
        private = json.loads(root['Data'][season_id])
        if private.get('OnlineId') != season_id or private.get('Language') != 'en-US':
            raise ValueError('SOURCE_SEASON_ID')
        normal = private['TaskConfig']['Tasks']
        weekly = [t for w in private['WeeklyTasksConfig']['WeeklyTasks'] for t in w['Tasks']]
        goals, seen = [], set()
        for t in [*normal, *weekly]:
            task_id = t['InternalName']
            if task_id in seen:
                raise ValueError('SOURCE_DUPLICATE_TASK')
            seen.add(task_id)
            objective = t['Objective']
            if not isinstance(objective, dict) or len(objective) != 1:
                raise ValueError('SOURCE_OBJECTIVE')
            kind, details = next(iter(objective.items()))
            row = {'id': task_id, 'kind': kind}
            if kind in SIMPLE:
                path, unit = SIMPLE[kind]
                row['value'] = scalar(details, path)
                row['unit'] = unit
            elif kind == 'DesignChallenge':
                if 'Votes' in details:
                    row['value'], row['unit'] = scalar(details, 'Votes'), 'votes'
                else:
                    row['value'] = scalar(details, 'DoChallenges.TargetAmount.Value.Value')
                    row['unit'] = 'entries'
            elif kind == 'Friend':
                row['friendshipLevel'] = scalar(details, 'MinimumFriendshipLevel')
                if 'Any' in details:
                    row['value'] = scalar(details, 'Any.AmountOfCharacter')
                    row['unit'] = 'characters'
            elif kind == 'EquipPet':
                row['companionLevel'] = scalar(details, 'MinimumFriendshipLevel')
            elif kind != 'VisitArea':
                raise ValueError('UNKNOWN_OBJECTIVE_KIND ' + kind)
            goals.append(row)
        seasons.append({
            'id': season_id, 'normalCount': len(normal),
            'weeklyCount': len(weekly), 'goals': goals,
        })
    return {
        'schema': SCHEMA,
        'source': {
            'gameVersion': 'Steam 1.26.2',
            'sourceSha256': expected_sha,
            'sourceBytes': expected_bytes,
            'staticNotPlayerProgress': True,
        },
        'seasons': seasons,
    }


def encode(doc):
    return (json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('destination')
    args = parser.parse_args()
    original = Path(args.source).read_bytes()
    output = encode(project(original))
    dest = Path(args.destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(output)
    print('Verified numeric task goals:', sum(len(s['goals']) for s in project(original)['seasons']))
    print('Public SHA256:', hashlib.sha256(output).hexdigest())


if __name__ == '__main__':
    main()
