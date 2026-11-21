"""Offline, private Guide quest search and verified on-demand detail locators.

Build exclusively from the same-build native quest catalogue and shard index.
The output never infers player quest progress, DLC ownership or live status.
Original source-derived text belongs only in owner-private storage.
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from quest_catalogue import SCHEMA as CATALOGUE_SCHEMA
from quest_detail_shards import SCHEMA as SHARD_SCHEMA, SOURCE_FILE, SHARD_COUNT, bucket_for

SCHEMA = 'wand.db03.quest-search@1'
MAX_INDEX_BYTES = 16 * 1024 * 1024
MAX_CATALOGUE_BYTES = 32 * 1024 * 1024
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
SHARD_FILE = re.compile(r'^quest-shards/part-(\d{2})\.json$')


def _sha(value):
    return (isinstance(value, str) and len(value) == 64 and
            all(c in '0123456789abcdef' for c in value))


def _positive_id(value):
    return (isinstance(value, str) and value.isascii() and value.isdecimal()
            and int(value) > 0)


def _normalize(value):
    return unicodedata.normalize('NFKC', value).casefold().strip()


def build_search(catalogue, shard_index):
    """Create a tiny source-typed UI index without reopening the ~98MB source.

    Completeness is asserted only for the records *inside the two supplied
    verified projections*. A missing / partial original source must not be
    treated as a confirmed game-data removal.
    """
    if not isinstance(catalogue, dict) or catalogue.get('schema') != CATALOGUE_SCHEMA:
        raise ValueError('QUEST_SEARCH_CATALOGUE_SCHEMA_MISMATCH')
    if not isinstance(shard_index, dict) or shard_index.get('schema') != SHARD_SCHEMA:
        raise ValueError('QUEST_SEARCH_SHARD_SCHEMA_MISMATCH')
    target = catalogue.get('target')
    if (not isinstance(target, dict) or not target.get('gameVersion') or
            not target.get('platform') or target != shard_index.get('target')):
        raise ValueError('QUEST_SEARCH_TARGET_MISMATCH')
    source = catalogue.get('source')
    if (not isinstance(source, dict) or source.get('file') != SOURCE_FILE or
            not _sha(source.get('sha256')) or source != shard_index.get('source')):
        raise ValueError('QUEST_SEARCH_SOURCE_MISMATCH')
    expected = shard_index.get('byId')
    groups = catalogue.get('questGroups')
    missions = catalogue.get('missions')
    unknown = catalogue.get('unclassified')
    if (not isinstance(expected, dict) or not isinstance(missions, list) or
            not isinstance(groups, list) or not isinstance(unknown, list) or
            not missions):
        raise ValueError('QUEST_SEARCH_INCOMPLETE_INPUT')
    classification = {}
    for kind, records in (('mission', missions), ('questGroup', groups), ('unclassified', unknown)):
        for row in records:
            if not isinstance(row, dict) or not _positive_id(row.get('id')):
                raise ValueError('QUEST_SEARCH_INVALID_SOURCE_RECORD')
            rid = row['id']
            if rid in classification:
                raise ValueError('QUEST_SEARCH_DUPLICATE_SOURCE_ID')
            classification[rid] = kind
    if set(classification) != set(expected):
        raise ValueError('QUEST_SEARCH_CATALOGUE_SHARD_COVERAGE_MISMATCH')
    source_counts = catalogue.get('counts', {})
    index_counts = shard_index.get('counts', {})
    for expected_count, observed in (
            ('missions', len(missions)), ('questGroups', len(groups)),
            ('unclassified', len(unknown)), ('nativeSourceRecords', len(classification))):
        if source_counts.get(expected_count) != observed:
            raise ValueError('QUEST_SEARCH_CATALOGUE_COUNT_MISMATCH')
    if index_counts.get('records') != len(classification):
        raise ValueError('QUEST_SEARCH_SHARD_COUNT_MISMATCH')
    for rid, kind in classification.items():
        locator = expected.get(rid)
        if not isinstance(locator, dict) or locator.get('kind') != kind:
            raise ValueError('QUEST_SEARCH_NATIVE_KIND_MISMATCH')
        path = locator.get('file')
        m = SHARD_FILE.fullmatch(path) if isinstance(path, str) else None
        bucket = locator.get('bucket')
        if (not m or type(bucket) is not int or not 0 <= bucket < SHARD_COUNT or
                int(m.group(1)) != bucket or bucket_for(rid) != bucket or
                not _sha(locator.get('nativeWireSha256')) or not _sha(locator.get('recordSha256'))):
            raise ValueError('QUEST_SEARCH_UNVERIFIED_DETAIL_LOCATOR')
    # The smaller search output only covers missions: the other two classes
    # must never accidentally appear in the playable quest search results.
    records = []
    for row in missions:
        rid = row['id']
        locator = expected[rid]
        if row.get('nativeWireSha256') != locator['nativeWireSha256']:
            raise ValueError('QUEST_SEARCH_NATIVE_WIRE_MISMATCH')
        names = row.get('names')
        if not isinstance(names, dict) or any(k not in LOCALES or not isinstance(v, str) or not v
                                                    for k, v in names.items()):
            raise ValueError('QUEST_SEARCH_INVALID_LOCALIZATIONS')
        for field in ('groupId', 'characterId'):
            val = row.get(field)
            if val is not None and not _positive_id(val):
                raise ValueError('QUEST_SEARCH_INVALID_GROUP_OR_CHARACTER')
        objectives = row.get('objectiveKinds')
        if not isinstance(objectives, dict) or any(not isinstance(k, str) or not k or
                    type(v) is not int or v <= 0 for k, v in objectives.items()):
            raise ValueError('QUEST_SEARCH_INVALID_OBJECTIVE_FACET')
        source_tags = row.get('sourceScopeTokens', [])
        if (not isinstance(source_tags, list) or
                any(not isinstance(s, str) or not s for s in source_tags)):
            raise ValueError('QUEST_SEARCH_INVALID_SOURCE_TAGS')
        records.append({
            'id': rid,
            'names': names,
            'internalName': row.get('rawName'),
            'groupId': row.get('groupId'),
            'characterId': row.get('characterId'),
            'typeCode': row.get('typeCode'),
            'sourceUpdateGroup': row.get('sourceUpdateGroup'),
            'sourceScopeTokens': source_tags,
            'objectiveKinds': sorted(objectives),
            'detail': {'file': locator['file'], 'recordSha256': locator['recordSha256'],
                       'nativeWireSha256': locator['nativeWireSha256']},
        })
    records.sort(key=lambda row: int(row['id']))
    return {
        'schema': SCHEMA,
        'target': target,
        'source': source,
        'meaning': 'native_playable_quest_definitions_only_not_live_or_player_state',
        'localizationPolicy': 'exact_source_strings_only; optional explicit English fallback, no invented translations',
        'detailPolicy': 'owner_private_quest_shards_verified_by_recordSha256',
        'counts': {'missions': len(records), 'sourceNativeRecords': len(classification),
                   'excludedQuestGroups': len(groups), 'excludedUnclassified': len(unknown),
                   'missionsWithNoResolvedName': sum(not r['names'] for r in records)},
        'records': records,
    }


def query_search(index, query='', *, locale='ja', character=None, group=None,
                 update_group=None, objective_kind=None, scope_token=None,
                 all_locales=False, include_internal=False, limit=50, offset=0):
    """Deterministic Unicode NFKC/casefold search; never evaluates availability."""
    if not isinstance(index, dict) or index.get('schema') != SCHEMA:
        raise ValueError('QUEST_SEARCH_INDEX_SCHEMA_MISMATCH')
    if locale not in LOCALES:
        raise ValueError('QUEST_SEARCH_UNSUPPORTED_LOCALE')
    if not isinstance(query, str) or len(query) > 128:
        raise ValueError('QUEST_SEARCH_INVALID_QUERY')
    if type(limit) is not int or not (1 <= limit <= 100) or type(offset) is not int or offset < 0:
        raise ValueError('QUEST_SEARCH_INVALID_PAGINATION')
    for value in (character, group):
        if value is not None and not _positive_id(value):
            raise ValueError('QUEST_SEARCH_INVALID_ID_FILTER')
    if type(all_locales) is not bool or type(include_internal) is not bool:
        raise ValueError('QUEST_SEARCH_INVALID_OPTIONS')
    for value in (update_group, objective_kind, scope_token):
        if value is not None and (not isinstance(value, str) or not value):
            raise ValueError('QUEST_SEARCH_INVALID_FACET')
    q = _normalize(query)
    terms = q.split()
    matched = []
    for row in index.get('records', []):
        if character is not None and row['characterId'] != character:
            continue
        if group is not None and row['groupId'] != group:
            continue
        if update_group is not None and row['sourceUpdateGroup'] != update_group:
            continue
        if objective_kind is not None and objective_kind not in row['objectiveKinds']:
            continue
        if scope_token is not None and scope_token not in row['sourceScopeTokens']:
            continue
        labels = [(locale, row['names'].get(locale))]
        if all_locales:
            labels.extend((k, v) for k, v in row['names'].items() if k != locale)
        elif locale != 'en':
            # Explicit English fallback is search-only: do not claim English is
            # the game's translation for a missing selected locale.
            labels.append(('en', row['names'].get('en')))
        if include_internal:
            labels.append(('internalName', row.get('internalName')))
        if not terms:
            rank, match_locale = 0, None
        elif q == row['id']:
            rank, match_locale = -1, 'nativeId'
        else:
            matched_labels = [(0 if _normalize(val) == q else
                               1 if _normalize(val).startswith(q) else
                               2 if q in _normalize(val) else 3, lang)
                              for lang, val in labels if isinstance(val, str)
                              and all(term in _normalize(val) for term in terms)]
            if not matched_labels:
                continue
            rank, match_locale = min(matched_labels)
        title = row['names'].get(locale) or row['names'].get('en') or row['internalName'] or row['id']
        matched.append((rank, _normalize(title), int(row['id']), match_locale, row))
    matched.sort(key=lambda x: (x[0], x[1], x[2]))
    return {
        'schema': SCHEMA,
        'target': index['target'],
        'status': 'static_source_search_only',
        'locale': locale,
        'query': query,
        'filters': {'character': character, 'group': group, 'updateGroup': update_group,
                    'objectiveKind': objective_kind, 'scopeToken': scope_token},
        'total': len(matched),
        'limit': limit, 'offset': offset,
        'nextOffset': offset + limit if offset + limit < len(matched) else None,
        'results': [{**row, 'matchedLocale': language,
                     'displayNameSource': locale if row['names'].get(locale) else
                                          ('en' if row['names'].get('en') else 'internalName')}
                    for _, _, _, language, row in matched[offset:offset+limit]],
    }


def _read(path, max_bytes):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError('QUEST_SEARCH_SOURCE_MISSING_OR_TOO_LARGE')
    return json.loads(path.read_text(encoding='utf-8'))


def make_from_paths(catalogue_path, shards_path, output):
    source = _read(Path(catalogue_path), MAX_CATALOGUE_BYTES)
    shard = _read(Path(shards_path), MAX_INDEX_BYTES)
    built = build_search(source, shard)
    from native_guide import save
    save(Path(output), built)
    return built


def main():
    p = argparse.ArgumentParser(description='Offline owner-private native Guide quest search index')
    p.add_argument('--catalogue', required=True, type=Path)
    p.add_argument('--shards', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--query', default=None)
    p.add_argument('--locale', default='ja', choices=LOCALES)
    p.add_argument('--character')
    p.add_argument('--group')
    p.add_argument('--objective')
    p.add_argument('--limit', type=int, default=20)
    args = p.parse_args()
    try:
        output = args.output.resolve()
        if output in (args.catalogue.resolve(), args.shards.resolve()):
            raise ValueError('QUEST_SEARCH_OUTPUT_OVERWRITES_INPUT')
        index = make_from_paths(args.catalogue, args.shards, args.output)
        stats = index['counts'] if args.query is None else query_search(index, args.query,
            locale=args.locale, character=args.character, group=args.group,
            objective_kind=args.objective, limit=args.limit)
        print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, UnicodeError) as err:
        p.exit(1, 'DB-03 quest search error: ' + str(err) + '\n')


if __name__ == '__main__':
    main()
