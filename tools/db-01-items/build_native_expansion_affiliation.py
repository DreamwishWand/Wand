"""Extract exact native ExpansionData, mandatory tag selectors, and historical tag membership.
Only source-defined IDs/enum labels and source hashes are published; no original bytes,
platform product keys, ownership state, or inference of a release from a tag alone.
"""
import argparse, base64, json, re, zlib
from collections import Counter
from pathlib import Path
from build_historical_content_scope import scan, declarations, BEFORE, AFTER, DUMP, sha, canonical, check
from build_complete_source_master import fields, scalar, varint, item_class

PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
SCHEMA='wand.db01.native-expansion-affiliation@1'

def enum(dump,name):
    matches=list(re.finditer(r'^// Namespace: Definitions\.Items\npublic enum '+name+r' // TypeDefIndex: \d+\n\{',dump,re.M))
    check(len(matches)==1,'ENUM_'+name)
    body=dump[matches[0].end():dump.index('\n}',matches[0].end())]
    return {int(n):k for k,n in re.findall(r'public const '+name+r' (\w+) = (-?\d+);',body)}

def contract(dump,name,expected):
    m=list(re.finditer(r'^public sealed class '+re.escape(name)+r'\s*:',dump,re.M))
    check(len(m)==1,'CLASS_'+name)
    body=dump[m[0].end():dump.index('\n}',m[0].end())]
    f={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
    check(all(f.get(k)==v for k,v in expected.items()),'SCHEMA_'+name)

def unpack_tags(wire,field):
    values=[]
    for n,w,v in wire:
        if n!=field:continue
        if w==0:values.append(v)
        elif w==2:
            p=0
            while p<len(v):
                x,p=varint(v,p);values.append(x)
        else:raise ValueError('TAG_WIRE')
    return set(values)

def build(before,after,proto_before,proto_current,dump_path):
    a,old=scan(before,BEFORE,35819); b,rows=scan(after,AFTER,39066,sorted(a))
    proto=proto_before.read_bytes();check(sha(proto)==PROTO and proto==proto_current.read_bytes(),'PROTO_VERSION_MATCH')
    dump=dump_path.read_bytes();check(sha(dump)==DUMP,'DUMP_PIN');dump=dump.decode('utf8')
    contract(dump,'ExpansionData',{'Name':1,'TagItemID':3,'VillageScene':6})
    contract(dump,'ExpansionTagData',{'ItemTypesWithMandatoryExpansionTags':1})
    contract(dump,'ItemTypeSelector',{'ItemType':1,'RestrictSubType':2,'SubType':3})
    enums=enum(dump,'ItemType');decl=declarations(dump)
    expansions=[];selectors=[];records={}; seen=set()
    top=fields(proto);check(len(top)==2246,'PROTO_CENSUS')
    for pos,(n,w,raw) in enumerate(top):
        check((n,w)==(1,2),'ENVELOPE');e=fields(raw);name=scalar(e,1,2).decode();m=fields(scalar(e,2,2));typ=scalar(m,5,2).decode()
        if typ not in ('Definitions.ExpansionData','Definitions.Items.ExpansionTagData'):continue
        check(name not in seen,'DUPLICATE_RECORD');seen.add(name);body=scalar(m,6,2);fs=fields(body);records[name]=[pos,sha(body)]
        if typ=='Definitions.ExpansionData':
            tag=scalar(fs,3,0);scene=scalar(fs,6,0);check(name==scalar(fs,1,2).decode() and rows[tag][0]=='Tag' and rows[scene][0]=='Scene','EXPANSION_REFERENCE')
            expansions.append([name,tag,scene])
        else:
            check(name=='ExpansionTagData','SELECTOR_NAME')
            for n,w,raw in fs:
                check((n,w)==(1,2),'SELECTOR_WIRE');s=fields(raw);code=scalar(s,1,0);restrict=scalar(s,2,0,0);sub=scalar(s,3,2,b'').decode()
                check(code in enums and restrict in (0,1),'SELECTOR_TYPE');cat=enums[code]
                subcode=None
                if restrict:
                    choices=enum(dump,cat+'ItemType');matches=[k for k,v in choices.items() if v==sub];check(len(matches)==1,'SELECTOR_SUBTYPE');subcode=matches[0]
                selectors.append([code,cat,bool(restrict),sub,subcode])
    check(len(expansions)==6 and len(selectors)==6 and len(records)==7,'EXPANSION_CENSUS')
    known={r[1]:r[0] for r in expansions};new=set(rows)-set(old);check(len(new)==3254,'NEW_COUNT')
    result=[];by_expansion=Counter();new_by_expansion=Counter();selected_count=Counter();missing=Counter();new_by_cat=Counter();typed=Counter();unmapped=Counter()
    for i,(cat,wire) in sorted(rows.items()):
        code=i//10000000;sub=i%10000000//100000;check(enums.get(code)==cat,'CATEGORY_CODE');cls=item_class(cat,sub)
        matches=[j for j,(c,_,restrict,_,sc) in enumerate(selectors) if c==code and (not restrict or sub==sc)]
        check(len(matches)<=1,'OVERLAPPING_SELECTOR');sel=matches[0] if matches else None
        if sel is not None:selected_count[cat]+=1
        tagdecl=decl.get(cls,{}).get('Tags')
        if not tagdecl:
            if sel is not None:
                unmapped[cls or 'unknown']+=1
                result.append([i,None,sel,None,i in new])
            continue
        field,typ=tagdecl;check(typ=='RepeatedField<int>','TAG_TYPE');typed[cat]+=1
        tags=sorted(unpack_tags(wire,field)&known.keys());check(len(tags)<=1,'AMBIGUOUS_EXPANSION_TAG')
        if not tags and sel is None:continue
        if not tags:missing[cat]+=1
        else:
            by_expansion[known[tags[0]]]+=1
            if i in new:
                new_by_expansion[known[tags[0]]]+=1
                if known[tags[0]]=='Expansion04':new_by_cat[cat]+=1
        result.append([i,tags[0] if tags else None,sel,field,i in new])
    data=json.dumps(result,separators=(',',':')).encode()
    return {'schema':SCHEMA,'platform':'Steam','observationVersion':'1.26.1','currentCompatibleVersion':'1.26.2',
      'introducedAfter':'1.25.3','sourceCorpusSha256':AFTER,'previousSourceCorpusSha256':BEFORE,
      'sourceFiles':b,'sourceProtoDbSha256':PROTO,'sourceIl2cppDumpSha256':DUMP,'protoDbUnchangedAcrossHotfix':True,
      'sourceRecords':records,'expansions':expansions,'selectors':selectors,
      'counts':{'typedTagDefinitions':sum(typed.values()),'selectedDefinitions':sum(selected_count.values()),'selectedByCategory':dict(selected_count),
          'noMatchingTagWithSelector':sum(missing.values()),'noMatchingTagByCategory':dict(missing),
          'selectorWithoutTypedTagField':sum(unmapped.values()),'selectorWithoutTypedTagFieldByClass':dict(unmapped),'taggedDefinitions':sum(by_expansion.values()),
          'byExpansion':dict(by_expansion),'newByExpansion':dict(new_by_expansion),'newKeepsakeByCategory':dict(new_by_cat),'rows':len(result)},
      'dataSha256':sha(data),'data':base64.b64encode(zlib.compress(data,9)).decode(),
      'runtimeOwnershipVerified':False,'contentReleaseAttributionVerifiedByTagAlone':False}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for a in ('before','after','proto-before','proto-current','dump','out'):p.add_argument('--'+a,type=Path,required=True)
    a=p.parse_args();d=build(a.before,a.after,a.proto_before,a.proto_current,a.dump);raw=canonical(d)+b'\n'
    with a.out.open('xb') as f:f.write(raw)
    print(json.dumps({'sha256':sha(raw),**d['counts'],'expansions':d['expansions'],'selectors':d['selectors'],'records':d['sourceRecords']},sort_keys=True))
if __name__=='__main__':main()
