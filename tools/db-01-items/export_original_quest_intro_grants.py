#!/usr/bin/env python3
"""Export only explicit intro grant facts from the authenticated Mission original.
The 1.26.2 snapshot contains direct Item and ItemIngredient choices, not
weighted alternatives. Refuse unknown source/schema rather than guess.
"""
import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter
MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
PROJECTION_SHA='1378add47506b64f701a5b0507ffba89d02e4681c168c47951cda4974f0de016'

def require(ok,why):
    if not ok: raise ValueError('DB01_QUEST_INTRO_'+why)

def varint(b,p):
    v=0
    for shift in range(0,70,7):
        require(p<len(b),'TRUNCATED')
        c=b[p];p+=1;v|=(c&127)<<shift
        if c<128:return v,p
    raise ValueError('DB01_QUEST_INTRO_VARINT')

def fields(b):
    p=0;r={}
    while p<len(b):
        k,p=varint(b,p);n,w=k>>3,k&7
        require(n>0,'FIELD')
        if w==0:x,p=varint(b,p)
        elif w==2:
            l,p=varint(b,p);require(p+l<=len(b),'LENGTH');x=b[p:p+l];p+=l
        elif w in (1,5):
            l=8 if w==1 else 4;require(p+l<=len(b),'FIXED');x=b[p:p+l];p+=l
        else:raise ValueError('DB01_QUEST_INTRO_WIRE')
        r.setdefault(n,[]).append((w,x))
    return r

def one(f,n,w):
    values=f.get(n,[])
    require(len(values)==1 and values[0][0]==w,'SINGLE_FIELD')
    return values[0][1]

def project(raw):
    require(len(raw)==4373535 and hashlib.sha256(raw).hexdigest()==MISSION_SHA,'SOURCE')
    p=0;rows=[];c=Counter();missions=0
    while p<len(raw):
        _,p=varint(raw,p);length,p=varint(raw,p)
        require(p+length<=len(raw),'FRAME')
        f=fields(raw[p:p+length]);p+=length;missions+=1
        quest=one(f,1,0)
        for i,(wire,blob) in enumerate(f.get(33,[])):
            require(wire==2,'INTRO_WIRE')
            grant=fields(blob);require(set(grant)=={1,2},'GRANT')
            sel=fields(one(grant,1,2));require(set(sel)=={1,2},'ANY_SELECTOR')
            category=one(sel,1,0);require(0<=category<=25,'CATEGORY')
            direct=fields(one(sel,2,2));require(set(direct)=={1},'DIRECT')
            g=fields(one(direct,1,2))
            require(set(g) in ({1,2,3,4,11,12,13,14,16,17,20,21,50,60,61},{1,2,3,11,12,13,14,16,17,20,21,50,60,61}),'GENERATOR_SHAPE')
            values=[]
            for n in (1,2):
                choice=fields(one(g,n,2));require(set(choice)=={1},'GENERATOR_CHOICE')
                values.append(one(choice,1,0))
            require(bool(values[0])!=bool(values[1]),'EXPLICIT_TARGET')
            kind=int(not values[0]);item=values[kind]
            amount=fields(one(grant,2,2));require(set(amount)=={1},'AMOUNT_KIND')
            val=fields(one(amount,1,2));require(set(val)=={1},'VALUE_SHAPE')
            count=one(val,1,0);require(count>0,'AMOUNT')
            rows.append([quest,i,item,count,kind,category]);c[kind]+=1
    require(missions==1030 and len(rows)==70 and c=={0:68,1:2},'CENSUS')
    body=(json.dumps(sorted(rows),separators=(',',':'))+'\n').encode()
    require(len(body)==2153 and hashlib.sha256(body).hexdigest()==PROJECTION_SHA,'PROJECTION')
    return body
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mission',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    a=p.parse_args();a.out.write_bytes(project(a.mission.read_bytes()))
    print(PROJECTION_SHA)
