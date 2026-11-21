"""Source-backed event/expansion -> Guide/item cross-reference index.

This file processes owner-private derived ProtoDB catalogues; it neither reads
online state nor turns static reward candidates into granted player items.
It refuses mismatched/partial projections rather than publishing stale links.
"""
import collections
import json
from pathlib import Path

SCHEMA = 'wand.db03.guide-event-links@1'
SOURCE_FILE = 'ddv_Data/StreamingAssets/protoDb.bin'
CATALOGS = (
    ('miniEvents', 'mini-events.json', 'Definitions.MiniEventData'),
    ('floatingFestivals', 'floating-festivals.json', 'Definitions.FloatingFestivalData'),
    ('expansions', 'expansions.json', 'Definitions.ExpansionData'),
)
MAX_CATALOG_BYTES = 16 * 1024 * 1024


def _string_id(value):
    if not isinstance(value, str) or not value or len(value) > 1024:
        raise ValueError('GUIDE_EVENT_INVALID_IDENTIFIER')
    return value


def _numeric_id(value):
    _string_id(value)
    if not value.isascii() or not value.isdecimal() or int(value) <= 0:
        raise ValueError('GUIDE_EVENT_INVALID_NUMERIC_REFERENCE')
    return value


def _load_catalogue(path, target, family, expected_class):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_CATALOG_BYTES:
        raise ValueError('GUIDE_EVENT_MISSING_OR_OVERSIZED_PROJECTION')
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('target') != target or data.get('family') != family:
        raise ValueError('GUIDE_EVENT_TARGET_OR_FAMILY_MISMATCH')
    rows = data.get('records')
    if not isinstance(rows, list):
        raise ValueError('GUIDE_EVENT_INVALID_RECORDS')
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or row.get('nativeClass') != expected_class:
            raise ValueError('GUIDE_EVENT_NATIVE_CLASS_MISMATCH')
        key = _string_id(row.get('id'))
        if key in seen:
            raise ValueError('GUIDE_EVENT_DUPLICATE_SOURCE_KEY')
        seen.add(key)
        source = row.get('source') or {}
        digest = source.get('sha256')
        if source.get('file') != SOURCE_FILE or not isinstance(digest, str) or len(digest) != 64:
            raise ValueError('GUIDE_EVENT_UNVERIFIED_SOURCE')
        if not isinstance(row.get('nativeWireSha256'), str) or len(row['nativeWireSha256']) != 64:
            raise ValueError('GUIDE_EVENT_MISSING_NATIVE_FINGERPRINT')
    return rows


def project_event_links(out, target, indexes, item_index_supplied, proto_status, save):
    """Generate compact typed relations only when ProtoDB projection exists.

    indexes must be native same-version indexes for quests, duties and worlds;
    `items` is optional and may be incomplete even if provided.
    """
    if proto_status != 'STATIC_SOURCE_ONLY':
        return {'status': 'source_not_available', 'links': 0, 'byRelationKind': {}}
    out = Path(out)
    rows_by_family = {}
    for family, filename, class_name in CATALOGS:
        rows_by_family[family] = _load_catalogue(out/'guide'/filename, target, family, class_name)
    links = []
    def add(row, family, target_family, target_id, relation_kind, path, wire_sha=None, projection_membership=None):
        target_id = _numeric_id(target_id)
        source = row['source']
        if target_family == 'items':
            membership = ('present_in_optional_partial_index' if target_id in indexes.get('items', set())
                          else 'not_in_optional_partial_index') if item_index_supplied else 'unchecked_optional_item_index'
            if projection_membership is not None:
                raise ValueError('GUIDE_EVENT_ITEM_MUST_NOT_USE_VERIFIED_INDEX')
        else:
            membership = ('present_in_native_source_index' if target_id in indexes.get(target_family, set())
                          else 'not_in_native_source_index')
            if projection_membership is not None:
                expected = 'present' if membership == 'present_in_native_source_index' else 'not_in_native_source_index'
                if projection_membership != expected:
                    raise ValueError('GUIDE_EVENT_STALE_PROJECTED_MEMBERSHIP')
        links.append({
            'fromFamily': family, 'fromId': row['id'],
            'toFamily': target_family, 'toId': target_id,
            'relationKind': relation_kind, 'sourceField': path,
            'targetIndexMembership': membership,
            'source': {'file': SOURCE_FILE, 'sha256': source['sha256'],
                       'definitionWireSha256': row['nativeWireSha256'],
                       'referenceWireSha256': wire_sha or row['nativeWireSha256']},
        })
    for row in rows_by_family['miniEvents']:
        for field, target, role, tag in (
                ('duties', 'duties', 'static_mini_event_duty_reference', 10),
                ('quests', 'quests', 'static_mini_event_quest_reference', 11)):
            if not isinstance(row.get(field), list):
                raise ValueError('GUIDE_EVENT_MISSING_TYPED_REFERENCES')
            for i, ref in enumerate(row[field]):
                if not isinstance(ref, dict):
                    raise ValueError('GUIDE_EVENT_INVALID_TYPED_REFERENCE')
                add(row, 'miniEvents', target, ref.get('id'), role,
                    f'protobuf.{tag}[{i}]', projection_membership=ref.get('status'))
        rewards = row.get('featuredRewardCandidates')
        if not isinstance(rewards, list):
            raise ValueError('GUIDE_EVENT_INVALID_REWARD_DEFINITIONS')
        for i, reward in enumerate(rewards):
            add(row, 'miniEvents', 'items', reward.get('itemId'),
                'static_mini_event_reward_candidate', f'protobuf.12[{i}].2',
                wire_sha=reward.get('sourceWireSha256'))
    for row in rows_by_family['floatingFestivals']:
        scene = row.get('targetScene')
        if scene is not None:
            add(row, 'floatingFestivals', 'worlds', scene.get('id'),
                'static_festival_target_scene_reference', 'protobuf.10',
                projection_membership=scene.get('status'))
        subs = row.get('targetSubSceneIds')
        if not isinstance(subs, list):
            raise ValueError('GUIDE_EVENT_INVALID_SUBSCENE_REFS')
        for i, sub in enumerate(subs):
            add(row, 'floatingFestivals', 'worlds', sub,
                'static_festival_target_subscene_reference', f'protobuf.11[{i}]')
        rewards = row.get('rewardDefinitions')
        if not isinstance(rewards, list):
            raise ValueError('GUIDE_EVENT_INVALID_REWARD_DEFINITIONS')
        for i, reward in enumerate(rewards):
            add(row, 'floatingFestivals', 'items', reward.get('itemId'),
                'static_festival_reward_candidate', f'protobuf.21[{i}].1',
                wire_sha=reward.get('sourceWireSha256'))
    for row in rows_by_family['expansions']:
        scene = row.get('villageScene')
        if scene is not None:
            add(row, 'expansions', 'worlds', scene.get('id'),
                'static_expansion_village_scene_reference', 'protobuf.6',
                projection_membership=scene.get('status'))
        if row.get('tagItemId'):
            add(row, 'expansions', 'items', row['tagItemId'],
                'static_expansion_tag_item_reference', 'protobuf.3')
    links.sort(key=lambda r: (r['fromFamily'],r['fromId'],r['relationKind'],r['sourceField'],r['toId']))
    counts = dict(sorted(collections.Counter(row['relationKind'] for row in links).items()))
    doc = {
        'schema': SCHEMA, 'target': target,
        'status': 'static_source_links_only_not_live_events_or_player_inventory',
        'source': 'archived_verified_protoDb_projection',
        'itemIndexCoverage': 'optional_partial_SRC01_membership_not_comprehensive',
        'meaning': 'Quest/duty/scene source references and item candidate/tag IDs; not granted rewards, entitlement, or current event status',
        'links': links,
        'counts': {'total': len(links), 'byRelationKind': counts,
                   'fromFamilies': {name: len(rows_by_family[name]) for name in rows_by_family}},
    }
    save(out/'database'/'guide-event-links.json', doc)
    return {'status': 'static_source_links_only', 'links': len(links), 'byRelationKind': counts}
