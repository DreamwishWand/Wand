#!/usr/bin/env python3
"""Read original PC/mobile MapMenu alpha fields, gated by Steam source identity."""
import argparse,hashlib,json,struct
from pathlib import Path
from inspect_native_map_layout import load_bundle,Reader,check
BUNDLE_SHA='46bcfc84aa09ab9eb11e8b343a0bc3abf20d303683d01c3371aeba6f99be12b6'
ASSEMBLY_SHA='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
MENUS={5138875048832321702:'bb587a5965734a8930efdc889ce4753636ae81e27e241327c548121618a203e9',7890347433120812857:'21b6e4485b70f94e27f1db9c26cfaf932aed93878184fa464e9597fa01d7743a'}

def inspect(bundle,assembly):
    check(hashlib.sha256(bundle.read_bytes()).hexdigest()==BUNDLE_SHA,'Unknown menu bundle')
    with assembly.open('rb') as f:check(hashlib.file_digest(f,'sha256').hexdigest()==ASSEMBLY_SHA,'Unknown native code')
    cab,(objs,_,unity)=load_bundle(bundle);check(cab=='CAB-eb24bf95426fa3aa34cd0b7216717c53' and unity=='6000.0.62f1','Unexpected bundle identity')
    # Native OnFocusIn passes constant 1 from this original .rdata address as backgroundUnlockedAlpha.
    with assembly.open('rb') as f:
        f.seek(0x7c59c00+0x189078e38-0x187c5c000);unlocked=struct.unpack('<f',f.read(4))[0]
    check(unlocked==1,'Background unlocked constant changed')
    rows=[]
    for pid,sha in MENUS.items():
        cl,b=objs[pid];check(cl==114 and hashlib.sha256(b).hexdigest()==sha,'Menu component changed')
        locked,name_locked,name_unlocked=struct.unpack_from('<3f',b,1820)
        refs=[]
        for i,name in enumerate(('MapBg','MapBgFloatingIsland','TextHolder')):
            f,p=struct.unpack_from('<iq',b,1832+12*i);check(f==0 and p in objs and objs[p][0]==1,'Invalid following GameObject')
            r=Reader(objs[p][1]);r.read(12*r.count());r.number('i');check(r.aligned_string()==name,'Following field identity mismatch');refs.append(str(p))
        rows.append({'componentPathID':str(pid),'objectSha256':sha,'settings':{'backgroundLocked':locked,'backgroundUnlocked':unlocked,'nameLocked':name_locked,'nameUnlocked':name_unlocked},'followingGameObjectIDs':refs})
    check(rows[0]['settings']==rows[1]['settings'],'PC/mobile values differ')
    return {'schema':'wand.src04.native-map-alpha-settings@1','privateOnly':True,'publicationAuthorized':False,'bundleSha256':BUNDLE_SHA,'assemblySha256':ASSEMBLY_SHA,'cab':cab,'menus':rows}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',required=True,type=Path);p.add_argument('--assembly',required=True,type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args();out=a.out.resolve();check(not any((d/'.git').exists() for d in out.parents),'Private output outside Git required')
    doc=inspect(a.bundle,a.assembly)
    with out.open('x',encoding='utf-8') as f:json.dump(doc,f,indent=2)
    print(doc['menus'][0]['settings'])
