"""Read-only static Guide catalogue for source-typed ProtoDB records.

This intentionally does NOT report current liveops availability, event activation,
player DLC entitlements, or a guaranteed reward.  Native type/field numbers are
from owner-held Steam v1.26.1 IL2CPP protobuf definitions.
"""
from datetime import datetime, timezone
from condition_schema import INT_OPERATORS

SCHEMA = 'wand.db03.protodb-guide-catalog@1'
KINDS = {'Definitions.MiniEventData': 'miniEvents',
         'Definitions.FloatingFestivalData': 'floatingFestivals',
         'Definitions.ExpansionData': 'expansions'}


def all_of(fields, number, wire):
    return [v for n, w, v in fields if (n, w) == (number, wire)]


def single(fields, number, wire):
    values = all_of(fields, number, wire)
    if len(values) > 1:
        raise ValueError('DUPLICATE_PROTO_DB_TYPED_FIELD')
    return values[0] if values else None


def _varint(raw, pos):
    start = pos
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(raw):
            raise ValueError('TRUNCATED_PROTO_DB_PACKED_INT')
        octet = raw[pos]
        pos += 1
        if shift == 63 and octet > 1:
            raise ValueError('OVERFLOW_PROTO_DB_PACKED_INT')
        value |= (octet & 127) << shift
        if octet < 128:
            canonical = bytearray()
            n = value
            while n > 127:
                canonical.append((n & 127) | 128)
                n >>= 7
            canonical.append(n)
            if raw[start:pos] != bytes(canonical):
                raise ValueError('NONCANONICAL_PROTO_DB_PACKED_INT')
            return value, pos
    raise ValueError('UNTERMINATED_PROTO_DB_PACKED_INT')


def source_ids(fields, field_number):
    """Source repeated int32 field: both packed (wire2) and unpacked (wire0)."""
    ids = []
    for field, wire, value in fields:
        if field != field_number:
            continue
        if wire == 0:
            ids.append(value)
        elif wire == 2:
            pos = 0
            while pos < len(value):
                number, pos = _varint(value, pos)
                ids.append(number)
        else:
            raise ValueError('INVALID_TYPED_REPEATED_ID_WIRE')
    return [str(x) for x in ids]


def archived_timestamp(blob, wire_fields, int_field, sha):
    """Google Protobuf Timestamp, as archived source only (not a live clock)."""
    fields = wire_fields(blob)
    seconds = single(fields, 1, 0)
    nanos = single(fields, 2, 0)
    record = {'sourceWireSha256': sha(blob)}
    if seconds is not None:
        record['secondsSinceUnixEpoch'] = seconds
        if nanos is not None:
            record['nanos'] = nanos
        if nanos is not None and nanos >= 1_000_000_000:
            raise ValueError('PROTO_DB_INVALID_TIMESTAMP_NANOS')
        try:
            dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            pass
        else:
            record['sourceUtcDateTime'] = dt.isoformat().replace('+00:00', 'Z')
    return record


def archived_condition_date(blob, wire_fields, int_field, sha):
    """ConditionDate: Operator=1, Date(Timestamp)=2, LocalTime=3."""
    ff = wire_fields(blob)
    result = {'sourceWireSha256': sha(blob)}
    operator = single(ff, 1, 0)
    if operator is not None:
        result['operatorCode'] = operator
        result['operator'] = INT_OPERATORS.get(operator, f'Unknown({operator})')
    dated = single(ff, 2, 2)
    if dated is not None:
        result['archivedDate'] = archived_timestamp(dated, wire_fields, int_field, sha)
    local = single(ff, 3, 0)
    if local is not None:
        result['localTime'] = bool(local)
    return result


def _date_fields(fields, rules, decoder):
    result = {}
    for field, label in rules.items():
        value = single(fields, field, 2)
        if value is not None:
            result[label] = decoder(value)
    return result


def _source_membership(ids, index):
    if index is None:
        return [{'id': x, 'status': 'unchecked'} for x in ids]
    return [{'id': x, 'status': 'present' if x in index else 'not_in_native_source_index'}
            for x in ids]


def project_entry(name, native_class, payload, wire_fields, text_field, int_field,
                  sha, localize, quest_ids=None, duty_ids=None, world_ids=None):
    """Return static source projection, never an evaluated event or entitlement."""
    if native_class not in KINDS:
        return None
    ff = wire_fields(payload)
    base = {'id': name, 'nativeClass': native_class,
            'nativeWireSha256': sha(payload), 'text': {},
            'availability': 'not_evaluated_archived_source_only'}
    for field, label in ((1, 'title'), (2, 'description')):
        key = text_field(ff, field)
        base['text'][label] = localize(key, name+'.'+label)
    ts = lambda raw: archived_timestamp(raw, wire_fields, int_field, sha)
    cd = lambda raw: archived_condition_date(raw, wire_fields, int_field, sha)
    if native_class == 'Definitions.MiniEventData':
        base['kind'] = 'miniEvent'
        base['archivedDateConditions'] = _date_fields(ff,
            {5: 'teasingDate', 6: 'startDate', 7: 'endDate'}, cd)
        base['segments'] = []
        for i, data in enumerate(all_of(ff, 8, 2)):
            item_fields = wire_fields(data)
            segment = {'index': i, 'sourceWireSha256': sha(data),
                       'name': text_field(item_fields, 1)}
            segment['archivedDates'] = _date_fields(item_fields,
                {2:'startDate', 3:'endDate'}, ts)
            base['segments'].append(segment)
        base['duties'] = _source_membership(source_ids(ff, 10), duty_ids)
        base['quests'] = _source_membership(source_ids(ff, 11), quest_ids)
        base['featuredRewardCandidates'] = []
        for i, blob in enumerate(all_of(ff, 12, 2)):
            rec = wire_fields(blob)
            item_id = single(rec, 2, 0)
            row = {'index': i, 'sourceWireSha256': sha(blob),
                   'itemId': str(item_id) if item_id is not None else None}
            for field, label in ((5, 'configuredAmount'), (6, 'featuringPriority')):
                value = single(rec, field, 0)
                if value is not None: row[label] = value
            base['featuredRewardCandidates'].append(row)
        base['resourcesKey'] = text_field(ff, 20)
    elif native_class == 'Definitions.FloatingFestivalData':
        base['kind'] = 'floatingFestival'
        base['archivedDates'] = _date_fields(ff,
            {5:'teasingDate', 6:'startDate', 7:'endDate'}, ts)
        scene = single(ff, 10, 0)
        if scene is not None and scene > 0:
            base['targetScene'] = _source_membership([str(scene)], world_ids)[0]
        base['targetSubSceneIds'] = source_ids(ff, 11)
        base['resourcesUIKey'] = text_field(ff, 12)
        conditions = single(ff, 13, 2)
        if conditions is not None:
            base['unlockConditionWireSha256'] = sha(conditions)
        base['puzzles'] = []
        for i, blob in enumerate(all_of(ff, 20, 2)):
            parsed = wire_fields(blob)
            row = {'index':i, 'sourceWireSha256':sha(blob)}
            row['archivedDates'] = _date_fields(parsed, {1:'startDate'}, ts)
            for field,label in ((10,'imageResource'),(11,'inactiveImageResource')):
                value = text_field(parsed, field)
                if value is not None: row[label] = value
            cond = single(parsed, 2, 2)
            if cond is not None:row['completionConditionWireSha256'] = sha(cond)
            base['puzzles'].append(row)
        base['rewardDefinitions'] = []
        for i, blob in enumerate(all_of(ff,21,2)):
            fields = wire_fields(blob)
            iid = single(fields,1,0)
            amount = single(fields,2,0)
            row = {'index':i,'sourceWireSha256':sha(blob),
                   'itemId':str(iid) if iid is not None else None,
                   'configuredAmount':amount}
            asset = text_field(fields,10)
            if asset is not None: row['imageOverrideResource'] = asset
            base['rewardDefinitions'].append(row)
    else:
        base['kind'] = 'expansion'
        item_id = single(ff, 3, 0)
        if item_id is not None and item_id > 0:
            base['tagItemId'] = str(item_id)
        base['iapUnlockReference'] = text_field(ff, 4)
        base['iapPackDefinitionHashes'] = [sha(x) for x in all_of(ff,5,2)]
        scene = single(ff,6,0)
        if scene is not None and scene > 0:
            base['villageScene'] = _source_membership([str(scene)], world_ids)[0]
        cond = single(ff,7,2)
        if cond is not None: base['visitedConditionWireSha256'] = sha(cond)
        for field,label in ((8,'showInStartMenu'),(9,'displayPriority')):
            val = single(ff,field,0)
            if val is not None: base[label] = bool(val) if field == 8 else val
        base['entitlement'] = 'not_evaluated'
    return base
