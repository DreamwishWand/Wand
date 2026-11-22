"""Offline, source-pinned Mission ConditionOneOf scalar extraction.

All supported field numbers/types and enums are transcribed from the user's
Steam v1.26.1 IL2CPP Definitions.Conditions types, whose Mission.json bytes
have been independently verified identical in Steam v1.26.2.

Do not guess protobuf defaults, runtime truth, online state or player progress.
"""
from datetime import datetime, timezone
import hashlib
import re

SOURCE_MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'

# Verified original IL2CPP enums; retain codes and explicit names, not estimates.
INT_OPERATORS = ('Equal','NotEqual','LessThan','LessThanOrEqual','GreaterThan','GreaterThanOrEqual')
EQUAL_OPERATORS = ('Equal','NotEqual')
SKIN_CONDITIONS = ('Wear','DontWear','Locked','Unlocked')
SHARD_CONDITIONS = ('Progression','PossessIndex')
KEYHOLE_OPERATORS = INT_OPERATORS
EVENT_STATES = ('NotStarted','InPreview','Playable','Over')
STORE_FRONTS = ('PlayStation','Switch','Xbox','Android','AppStore','macOS','Steam','Epic','MacStore','Microsoft','Windows','Headless','AppleArcade')

# kind -> protobuf field -> (wire type, destination, type/enum)
# Date 2=Google.Protobuf.WellKnownTypes.Timestamp
# Timestamp 3=Google.Protobuf.WellKnownTypes.Duration
SCHEMAS = {
    'CharacterSkin': {1:(0,'skinId','id'), 2:(0,'skinCondition','skin')},
    'Date': {1:(0,'comparisonOperator','int_op'),2:(2,'dateUtc','timestamp'),3:(0,'localTime','bool')},
    'Timestamp': {1:(2,'timestampKey','string'),2:(0,'comparisonOperator','int_op'),
                  3:(2,'elapsed','duration'),4:(0,'numberOfResets','int')},
    'DialogueFlag': {1:(0,'dialogueFlagId','id'),2:(0,'inversed','bool')},
    'FloatingFestivalTime': {1:(2,'eventKey','string'),2:(0,'inversed','bool'),
                             3:(0,'requestedEventAvailability','event_state')},
    'MemoryShard': {1:(0,'shardId','id'),2:(0,'shardCondition','shard'),
                    3:(0,'comparisonOperator','int_op'),4:(0,'progress','int')},
    'EventTimeSegment': {1:(2,'eventKey','string'),2:(0,'inversed','bool'),
                         3:(2,'eventSegment','string')},
    'KeyholeStatus': {1:(2,'keyholeKey','string'),2:(0,'keyholeLevel','int'),
                      3:(0,'keyholeStatusOperator','keyhole')},
    'MountIsUnlocked': {1:(0,'mountId','id'),2:(0,'inversed','bool')},
    'StoreFront': {1:(0,'equalOperator','equal'),2:(0,'storeFront','storefront')},
    'OfflineAgegate': {1:(0,'inversed','bool')},
    'Expansion': {1:(2,'expansionName','string'),2:(0,'inversed','bool'),3:(0,'anyPlatform','bool')},
    'Hourglass': {1:(0,'upgradeItemId','id'),2:(0,'comparisonOperator','int_op'),3:(0,'hourglassLevel','int')},
    'AlwaysTrue': {},
}
ENUMS={'int_op':INT_OPERATORS,'equal':EQUAL_OPERATORS,'skin':SKIN_CONDITIONS,
       'shard':SHARD_CONDITIONS,'keyhole':KEYHOLE_OPERATORS,
       'event_state':EVENT_STATES,'storefront':STORE_FRONTS}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def varint(data,pos):
    start=pos
    val=0
    for shift in range(0,70,7):
        if pos>=len(data): raise ValueError('TRUNCATED_VARINT')
        b=data[pos];pos+=1
        if shift==63 and b>1: raise ValueError('VARINT_OVERFLOW')
        val|=(b&127)<<shift
        if b<128:
            if encode_varint(val)!=data[start:pos]:raise ValueError('NONCANONICAL_VARINT')
            return val,pos
    raise ValueError('VARINT_UNTERMINATED')


def encode_varint(value):
    if not isinstance(value,int) or value<0 or value>=1<<64:raise ValueError('INVALID_VARINT')
    out=bytearray()
    while value>127:
        out.append(value&127|128)
        value>>=7
    out.append(value)
    return bytes(out)


def wire_fields(data):
    pos=0
    fields=[]
    while pos<len(data):
        tag,pos=varint(data,pos)
        n,w=tag>>3,tag&7
        if n<=0 or w not in (0,1,2,5): raise ValueError('INVALID_PROTO_TAG')
        if w==0:value,pos=varint(data,pos)
        elif w==2:
            size,pos=varint(data,pos)
            if size>len(data)-pos:raise ValueError('TRUNCATED_PROTO_DATA')
            value=data[pos:pos+size];pos+=size
        else:
            size=8 if w==1 else 4
            if size>len(data)-pos:raise ValueError('TRUNCATED_PROTO_FIXED')
            value=data[pos:pos+size];pos+=size
        fields.append((n,w,value))
    return fields


def original_quests(data):
    if digest(data)!=SOURCE_MISSION_SHA:raise ValueError('UNVERIFIED_ORIGINAL_MISSION')
    pos=0
    frames={}
    first_base=None
    while pos<len(data):
        off,pos=varint(data,pos)
        size,pos=varint(data,pos)
        if size<=0 or size>8*1024*1024 or size>len(data)-pos:
            raise ValueError('INVALID_MISSION_FRAME')
        frame=data[pos:pos+size];pos+=size
        ff=wire_fields(frame)
        ids=[v for n,w,v in ff if n==1 and w==0]
        if len(ids)!=1:raise ValueError('AMBIGUOUS_MISSION_ID')
        key=str(ids[0]);base=ids[0]-off
        if first_base is None:first_base=base
        if key in frames or base!=first_base:raise ValueError('DUPLICATE_OR_CORRUPTED_MISSION')
        frames[key]=(ff,digest(frame))
    if len(frames)!=1030:raise ValueError('MISSION_NATIVE_CENSUS')
    return frames


def one_field(ff,field,wire):
    entries=[v for n,w,v in ff if n==field and w==wire]
    if len(entries)!=1:raise ValueError('MISSING_OR_DUPLICATE_NATIVE_FIELD')
    return entries[0]


def payload_of(quest_fields,path,kind):
    role,*positions=path.split('.conditions[')
    field={'availableConditions':20,'unlockConditions':21}.get(role)
    if field is None or not positions:raise ValueError('NOT_DIRECT_QUEST_CONDITION')
    body=one_field(quest_fields,field,2)
    for j,chunk in enumerate(positions):
        matched=re.fullmatch(r'(\d+)\](\.nested)?',chunk)
        if not matched or (j+1<len(positions))!=(matched.group(2)=='.nested'):
            raise ValueError('WRONG_CONDITION_SOURCE_PATH')
        ordinal=int(matched.group(1))
        child=[v for n,w,v in wire_fields(body) if n==2 and w==2]
        if ordinal>=len(child):raise ValueError('SOURCE_LEAF_MISSING')
        tagged=[(n,v) for n,w,v in wire_fields(child[ordinal]) if w==2]
        if len(tagged)!=1:raise ValueError('AMBIGUOUS_OR_UNKNOWN_NATIVE_ONEOF')
        n,body=tagged[0]
        if j+1<len(positions) and n!=10:raise ValueError('MISSING_NATIVE_SUBCONDITIONS')
    return n,body


def _decode_string(raw):
    result=raw.decode('utf-8')
    if len(result)>160 or any(ord(c)<32 for c in result):
        raise ValueError('INVALID_PROTO_STRING')
    return result


def _signed64(value):
    return value-(1<<64) if value>=(1<<63) else value


def _wellknown(raw,kind):
    fields=wire_fields(raw)
    if any(n not in (1,2) or w!=0 for n,w,_ in fields):raise ValueError('INVALID_WELLKNOWN_FIELDS')
    if len({n for n,w,v in fields})!=len(fields):raise ValueError('DUPLICATE_WELLKNOWN_FIELD')
    mapping={n:v for n,w,v in fields}
    seconds=_signed64(mapping.get(1,0))
    nanos=_signed64(mapping.get(2,0))
    if abs(seconds)>100_000_000_000 or abs(nanos)>999_999_999:
        raise ValueError('WELLKNOWN_OUT_OF_RANGE')
    result={kind+'Seconds':seconds}
    if nanos:result[kind+'Nanos']=nanos
    if kind=='date':
        if not 0<=nanos<=999_999_999:raise ValueError('TIMESTAMP_NANO_RANGE')
        # Calendar conversion only; localTime is a separate native predicate flag.
        instant=datetime.fromtimestamp(seconds,timezone.utc).isoformat(timespec='seconds')
        result['dateUtc']=instant.replace('+00:00','Z')
    return result


def decode_native_scalar_fields(kind,payload):
    """Decode IL2CPP-declared scalar fields for formerly opaque Quest leaves.

    Refuses guessed or unsupported field tags/wire types, ambiguous repeated
    fields, malformed UTF-8 and invalid well-known Timestamp/Duration payloads.
    """
    if kind not in SCHEMAS:raise ValueError('NO_VERIFIED_NATIVE_SCALAR_CONTRACT:'+kind)
    schema=SCHEMAS[kind]; raw=wire_fields(payload)
    if len({n for n,w,v in raw})!=len(raw):raise ValueError('DUPLICATE_NATIVE_PREDICATE_FIELD')
    result={}
    for n,w,val in raw:
        if n not in schema or schema[n][0]!=w:
            raise ValueError(f'UNSUPPORTED_TYPED_PREDICATE_FIELD:{kind}:{n}:{w}')
        _,name,typ=schema[n]
        if typ=='string':result[name]=_decode_string(val)
        elif typ=='timestamp':result.update(_wellknown(val,'date'))
        elif typ=='duration':result.update(_wellknown(val,'elapsed'))
        elif typ=='bool':
            if val not in (0,1):raise ValueError('INVALID_BOOLEAN')
            result[name]=bool(val)
        elif typ=='id':
            if not isinstance(val,int) or val<=0 or val>2**53-1:raise ValueError('INVALID_NATIVE_ID')
            result[name]=str(val)
        elif typ=='int':
            if val>2**53-1:raise ValueError('INVALID_INTEGER_SCALAR')
            result[name]=val
        elif typ in ENUMS:
            options=ENUMS[typ]
            result[name+'Code']=val
            result[name]=options[val] if val<len(options) else f'Unknown({val})'
        else:raise ValueError('INVALID_DECLARATION')
    return result


def enrich_quest_condition(quest_fields,source_path,leaf):
    kind=leaf['type']
    number,payload=payload_of(quest_fields,source_path,kind)
    if number!=leaf['protobufField'] or digest(payload)!=leaf['nativeWireSha256']:
        raise ValueError('NATIVE_PREDICATE_SHA256_MISMATCH')
    if sorted({n for n,w,v in wire_fields(payload)})!=leaf['nativePayloadFields']:
        raise ValueError('SOURCE_NATIVE_FIELD_LIST_MISMATCH')
    return decode_native_scalar_fields(kind,payload)