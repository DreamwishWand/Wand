"""Offline, owner-original pinned DB-03 event/default-friendship source projection.

Private Steam 1.26.1 extracts are accepted only when exact hashes match; the
owner's independent full-original 1.26.2 comparison must confirm unchanged
protoDb and default-friendship original bytes. Output only small, game-derived
static reward facts and localized titles. No original files or save content.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
import re
from pathlib import Path

SCHEMA = 'wand.db03.public-event-friendship-rewards@1'
SHA = {
    'event_links': '4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c',
    'mini': 'b9298db9ea514f95718e69260b5a59a872639baf38fd6809eefdfec11b18aa59',
    'floating': '70a1c90d5b589bebfaff484b2f2cb7c3f7e1393c11e4275c79b6569daf50bf0d',
    'friendship': '4bcb2675ef5152590b9efd67bfa5487cbc2479a31fecf0fab0ad412e1210a9b0',
    'composite': '96f937c8c07ac6d8b799458299a3014fc1b94d005df172dba03b6d76d298a88c',
}
PROTO = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
FRIENDSHIP = '90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22'
LANGS = ('ja', 'en', 'fr', 'it', 'de', 'es-ES', 'zh-CN', 'pt-BR')
STAGES = ('FirstIntermediateReward', 'SecondIntermediateReward', 'ThirdIntermediateReward', 'CompletedReward')
REWARD = {'static_mini_event_reward_candidate': ('mini_event', 'protobuf.12', '2'),
          'static_festival_reward_candidate': ('floating_festival', 'protobuf.21', '1')}
ID = re.compile(r'^[1-9][0-9]{0,15}$')
HEX = re.compile(r'^[0-9a-f]{64}$')


def require(ok, message):
    if not ok: raise ValueError('DB03_EVENT_FRIENDSHIP_' + message)


def read(path: Path, name: str):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size < 20_000_000,
            'SOURCE_FILE_MISSING_' + name)
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == SHA[name], 'SOURCE_SHA_' + name)
    return json.loads(raw)


def make(links, mini, festivals, friendship, composite):
    require(links.get('schema') == 'wand.db03.guide-event-links@1' and
            links.get('source') == 'archived_verified_protoDb_projection' and
            links.get('status') == 'static_source_links_only_not_live_events_or_player_inventory' and
            links.get('counts', {}).get('total') == 381 and len(links.get('links', [])) == 381,
            'EVENT_LINKS_CONTRACT')
    kinds = links['counts']['byRelationKind']
    require(kinds.get('static_mini_event_reward_candidate') == 171 and
            kinds.get('static_festival_reward_candidate') == 31 and
            Counter(x['relationKind'] for x in links['links']) == kinds,
            'EVENT_KINDS')
    for key, item, required in [('mini_event', mini, 19), ('floating_festival', festivals, 5)]:
        require(item.get('schema') == 'wand.db03.protodb-static@1' and
                isinstance(item.get('records'), list) and len(item['records']) == required,
                'NATIVE_' + key)
    require(friendship.get('schema') == 'wand.db03.native-guide@1' and
            friendship.get('scope') == 'default_friendship_levels_only' and
            friendship.get('target') == {'gameVersion': '1.26.1', 'platform': 'Steam'} and
            len(friendship.get('records', [])) == 16, 'FRIENDSHIP_CONTRACT')
    require(composite.get('schema') == 'wand.db03.guide-source-composite@2' and
            composite.get('target') == {'gameVersion': '1.26.2', 'platform': 'Steam'} and
            composite.get('staticProtoDb', {}).get('originalSha256') == PROTO and
            composite['staticProtoDb'].get('nativeEntries') == 2246 and
            composite.get('friendshipDefaultSource', {}).get('nativeSourceSha256') == FRIENDSHIP and
            composite['friendshipDefaultSource'].get('exactFullOriginalFileContentIdentical') is True and
            composite['friendshipDefaultSource'].get('records') == 16,
            'SOURCE_EQUIVALENCE')
    events = {}
    for family, item in [('mini_event', mini), ('floating_festival', festivals)]:
        for record in item['records']:
            ident = record['id']
            require(ident not in events and re.fullmatch(r'[A-Za-z0-9_!-]{1,128}', ident),
                    'DUPLICATE_EVENT_KEY')
            native = record['source']
            require(native.get('sha256') == PROTO and native.get('file') ==
                    'ddv_Data/StreamingAssets/protoDb.bin' and
                    native.get('nativeWireSha256') == record.get('nativeWireSha256') and
                    HEX.fullmatch(record['nativeWireSha256']) is not None,
                    'EVENT_NATIVE_SOURCE')
            labels = record['text'].get('title', {}).get('plainText', {})
            names = {lang: labels[lang] for lang in LANGS if isinstance(labels.get(lang), str)
                     and 0 < len(labels[lang]) <= 240}
            require(names.get('en') and names.get('ja'), 'NATIVE_EVENT_LABEL')
            candidates = record['featuredRewardCandidates'] if family == 'mini_event' else record['rewardDefinitions']
            slots = {}
            for c in candidates:
                i = c['index']
                require(isinstance(i, int) and i >= 0 and i not in slots and
                        isinstance(c['itemId'], str) and ID.fullmatch(c['itemId']) and
                        HEX.fullmatch(c['sourceWireSha256']), 'SOURCE_REWARD_SLOT')
                amt = c.get('configuredAmount')
                require(amt is None or isinstance(amt, int) and amt >= 0,
                        'SOURCE_REWARD_AMOUNT')
                slots[i] = (c['itemId'], amt, c['sourceWireSha256'])
            require(list(sorted(slots)) == list(range(len(slots))), 'SLOT_POSITION')
            events[ident] = {'kind': family, 'id': ident, 'names': names,
                             'nativeSha': record['nativeWireSha256'], 'slots': slots,
                             'rewards': []}
    seen = set()
    reward_refs = 0
    for i, row in enumerate(links['links']):
        kind = row['relationKind']
        if kind not in REWARD: continue
        family, prefix, final = REWARD[kind]
        event_id = row['fromId']
        ev = events.get(event_id)
        require(ev is not None and ev['kind'] == family and row['toFamily'] == 'items' and
                row['fromFamily'] == ('miniEvents' if family == 'mini_event' else 'floatingFestivals'),
                'EVENT_FAMILY')
        source = row['source']
        match = re.fullmatch(re.escape(prefix) + r'\[(\d+)\]\.' + final,
                             row['sourceField'])
        require(match is not None, 'REWARD_FIELD')
        slot = int(match.group(1))
        expect = ev['slots'].get(slot)
        require(expect is not None and expect[0] == row['toId'] and
                expect[2] == source.get('referenceWireSha256') and
                ev['nativeSha'] == source.get('definitionWireSha256') and
                source.get('sha256') == PROTO and
                source.get('file') == 'ddv_Data/StreamingAssets/protoDb.bin' and
                row.get('targetIndexMembership') in
                ('present_in_optional_partial_index', 'not_in_optional_partial_index'),
                'ORIGINAL_REFERENCE_MISMATCH')
        require((family, event_id, slot) not in seen, 'DUPLICATE_REWARD_SLOT')
        seen.add((family, event_id, slot))
        # Original link-list index is stable and also used by existing private
        # DB-03 reward relationId event/<i> (thus DB-02 origin ID alignment).
        ev['rewards'].append([i, slot, expect[0], expect[1]])
        reward_refs += 1
    require(reward_refs == 202 and all(len(x['rewards']) == len(x['slots']) for x in events.values()),
            'EVENT_REWARD_CENSUS')
    rows = []
    for i, row in enumerate(friendship['records']):
        require(row.get('scope') == 'default_friendship_level_not_character_specific' and
                row.get('source', {}).get('file') ==
                'ddv_Data/StreamingAssets/friendship_levels_default.json' and
                row['source'].get('sha256') == FRIENDSHIP and
                row.get('level') in (1, 2, 3, 4) and
                row.get('rewardStage') in STAGES and
                row.get('id') == f'default:{row["level"]}:{row["rewardStage"]}:0' and
                isinstance(row.get('nativeRewardId'), str) and ID.fullmatch(row['nativeRewardId']) and
                isinstance(row.get('amount'), int) and row['amount'] > 0,
                'DEFAULT_FRIENDSHIP_ROW')
        rows.append([i, row['level'], STAGES.index(row['rewardStage']),
                     row['nativeRewardId'], row['amount']])
    require(len(rows) == 16 and
            {(x[1], x[2]) for x in rows} == {(level, stage) for level in range(1, 5)
                                                for stage in range(4)},
            'FRIENDSHIP_CENSUS')
    for event in events.values():
        event['rewards'].sort(key=lambda r: r[1])
    clean = [{k: v for k, v in row.items() if k not in ('slots', 'nativeSha')}
             for row in events.values()]
    clean.sort(key=lambda x: (x['kind'], x['id']))
    result = {
        'schema': SCHEMA,
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'source': {'originalExtractVersion': '1.26.1',
                   'staticGameFilesIdenticalTo1262': True,
                   'protoDbSha256': PROTO, 'defaultFriendshipSha256': FRIENDSHIP,
                   'originalEventLinksSha256': SHA['event_links'],
                   'originalFriendshipProjectionSha256': SHA['friendship'],
                   'staticCandidatesOnly': True, 'liveStateVerified': False,
                   'characterSpecificFriendshipRewardsVerified': False},
        'counts': {'events': 24, 'miniEvents': 19, 'floatingFestivals': 5,
                   'eventRewardCandidates': 202, 'miniEventCandidates': 171,
                   'festivalCandidates': 31, 'friendshipDefaultCandidates': 16,
                   'distinctEventItemIds': 139, 'distinctAllItemIds': 141},
        'events': clean, 'defaultFriendshipRewards': rows}
    ids = {reward[2] for event in clean for reward in event['rewards']}
    ids_all = ids | {row[3] for row in rows}
    require(len(ids) == 139 and len(ids_all) == 141, 'ITEM_ID_CENSUS')
    return result


def emit(args):
    payload = make(read(Path(args.event_links), 'event_links'),
                   read(Path(args.mini), 'mini'),
                   read(Path(args.floating), 'floating'),
                   read(Path(args.friendship), 'friendship'),
                   read(Path(args.composite), 'composite'))
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True,
                     separators=(',', ':')).encode('utf-8')
    out = Path(args.out)
    out.write_bytes(raw)
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'counts': payload['counts']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ('event-links', 'mini', 'floating', 'friendship', 'composite', 'out'):
        parser.add_argument('--' + key, required=True)
    print(json.dumps(emit(parser.parse_args()), ensure_ascii=False))