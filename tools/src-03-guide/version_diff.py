"""Conservative, source-coverage-aware Guide version comparisons.

A missing source/archive is never evidence of removed game content. Native
per-record wire fingerprints and exact localized text are compared rather
than derived schema annotations, preventing code-only changes from looking
like game updates. No current liveops availability is inferred.
"""
import json
from pathlib import Path

SCHEMA = 'wand.db03.native-version-diff@1'
NATIVE_FAMILIES = ('quests', 'characters', 'stories', 'worlds', 'duties',
                   'events', 'conditions', 'conditionalEvents', 'tutorials')
FILE_NAMES = {**{f:'guide/'+f+'.json' for f in NATIVE_FAMILIES},
              'rewards':'guide/rewards.json',
              'designChallenges':'guide/design-challenges.json',
              'starPathFtue':'guide/starpath-ftue.json'}


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def available(manifest, family):
    if family in NATIVE_FAMILIES:
        return family in manifest.get('sources', {})
    if family=='rewards':
        return manifest.get('friendshipRewardSource') is not None
    return manifest.get('protoDbStatic',{}).get('status')=='STATIC_SOURCE_ONLY'


def signature(row, family):
    """Native payload + translated source text, excluding derived-code fields.

    Source SHA is not included: an unrelated source record changing its file
    digest must not mark all records as changed. Quest target annotations and
    UI-side display projections also must not trigger false game diffs.
    """
    if family=='rewards':
        return {key:row.get(key) for key in ('level','xp','rewardStage',
                                            'nativeRewardId','amount')}
    wire = row.get('nativeWireSha256')
    if wire is None:
        wire = row.get('source',{}).get('nativeWireSha256')
    if not wire:
        raise ValueError('NATIVE_WIRE_FINGERPRINT_NOT_AVAILABLE')
    # Keep this limited to the long-lived extraction contract. A newly added
    # derived projection (e.g. detailed objective descriptions) must not make
    # a byte-identical game source appear to have changed. The top-level
    # description keys and original step-localized strings are stable since
    # the initial native schema. Any native string/key change is detected by
    # nativeWireSha256 even when a new derived mapping is not compared here.
    if family in ('designChallenges','starPathFtue'):
        texts=row.get('text',{})
    else:
        texts={'topLevel':row.get('localizedText',{}),
               'steps':[step.get('localizedText',{}) for step in row.get('steps',[])]}
    return {'nativeWireSha256':wire,'nativeClass':row.get('nativeClass'),
            'localizedTexts':texts}


def compare_snapshots(previous, current, current_manifest=None):
    previous=Path(previous)
    current=Path(current)
    if previous.resolve()==current.resolve():
        raise ValueError('PREVIOUS_OUTPUT_EQUALS_CURRENT_OUTPUT')
    old_manifest_path=previous/'manifest.json'
    if not old_manifest_path.is_file():
        raise ValueError('PREVIOUS_MANIFEST_NOT_FOUND')
    old_manifest=load_json(old_manifest_path)
    if current_manifest is None:
        current_manifest=load_json(current/'manifest.json')
    if not isinstance(old_manifest.get('sources'),dict):
        raise ValueError('PREVIOUS_MANIFEST_SOURCES_NOT_FOUND')
    old_target=old_manifest.get('target')
    new_target=current_manifest.get('target')
    # Different platforms need a separate compatibility model, not a game
    # version diff that silently treats port differences as additions.
    if not isinstance(old_target,dict) or not isinstance(new_target,dict):
        raise ValueError('VERSION_DIFF_TARGET_UNAVAILABLE')
    if old_target.get('platform')!=new_target.get('platform'):
        raise ValueError('DIFFERENT_PLATFORM_VERSION_DIFF_NOT_SUPPORTED')

    added,removed,changed=[],[],[]
    compared=[]
    skipped=[]
    for family,relative in FILE_NAMES.items():
        old_has=available(old_manifest,family)
        new_has=available(current_manifest,family)
        if not old_has and not new_has:
            # Missing from both snapshots is not evidence of a new change.
            continue
        if not old_has or not new_has:
            skipped.append({'family':family,'reason':
                'source_absent_from_previous_snapshot' if not old_has else
                'source_absent_from_current_snapshot'})
            continue
        old_file=previous/relative
        new_file=current/relative
        if not old_file.is_file() or not new_file.is_file():
            skipped.append({'family':family,'reason':
                'projected_file_missing_from_previous_snapshot' if not old_file.is_file()
                 else 'projected_file_missing_from_current_snapshot'})
            continue
        old_data=load_json(old_file)
        new_data=load_json(new_file)
        old_records=old_data.get('records')
        new_records=new_data.get('records')
        if not isinstance(old_records,list) or not isinstance(new_records,list):
            skipped.append({'family':family,'reason':'invalid_projection_record_array'})
            continue
        if any(not isinstance(row,dict) or not isinstance(row.get('id'),str)
               for row in old_records+new_records):
            skipped.append({'family':family,'reason':'invalid_projection_record_id'})
            continue
        if family!='rewards' and any(not (
               row.get('nativeWireSha256') or
               row.get('source',{}).get('nativeWireSha256'))
               for row in old_records+new_records if isinstance(row,dict)):
            skipped.append({'family':family,'reason':'native_wire_fingerprint_unavailable'})
            continue
        old_index={row['id']:signature(row,family) for row in old_records}
        new_index={row['id']:signature(row,family) for row in new_records}
        if len(old_index)!=len(old_records) or len(new_index)!=len(new_records):
            skipped.append({'family':family,'reason':'duplicate_projected_record_id'})
            continue
        old_ids=set(old_index)
        new_ids=set(new_index)
        for rid in sorted(new_ids-old_ids):added.append({'family':family,'id':rid})
        for rid in sorted(old_ids-new_ids):removed.append({'family':family,'id':rid})
        for rid in sorted(old_ids&new_ids):
            if old_index[rid]!=new_index[rid]:changed.append({'family':family,'id':rid})
        compared.append(family)
    return {'schema':SCHEMA,
            'status':'PARTIAL_COMPARISON' if skipped else ('COMPARED' if compared else 'NOT_COMPARABLE'),
            'comparisonBasis':'native_wire_and_exact_source_localizations',
            'previousTarget':old_target, 'target':new_target,
            'comparedFamilies':compared,'uncomparedFamilies':skipped,
            'added':added,'removed':removed,'changed':changed,
            'notes':['Only families whose native source exists in BOTH snapshots are compared.',
                     'Missing archive files never imply in-game removals.',
                     'Code-only derived schema changes do not count as game changes.',
                     'Localization comparison covers stable top-level and original step projections; newer deep annotations are not an independent diff source.',
                     'Static DreamSnaps and Star Path FTUE are not live event availability.']}
