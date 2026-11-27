"""Unity 6 controller photo-state reference resolution; not an Animator state-machine emulator."""
from resolve_animation_bundle import Reader
from pose_curves import require

def controller(raw):
 r=Reader(raw);name=r.string();size,=r.unpack('I');start=r.pos
 def arr(width):return r.take(r.count(width)*width)
 def conditions():return [r.unpack('IIff') for _ in range(r.count(16))]
 def transition():
  cs=conditions();dest,full,id,user,duration,offset,exit=r.unpack('4I3f');r.take(2);r.align();r.take(6);r.align();return dict(conditions=cs,destination=dest,fullPath=full,id=id,user=user,duration=duration,offset=offset,exit=exit)
 def blend():
  blend_type,event,y=r.unpack('3I');children=r.unpack(f'{r.count(4)}I');arr(4);arr(8);arr(4);arr(8);arr(8)
  for _ in range(r.count(4)):arr(4)
  arr(4);r.take(1);r.align();clip,duration,cycle=r.unpack('Iff');mirror,=r.unpack('B');r.align();return dict(children=children,clip=clip,duration=duration,cycle=cycle,mirror=mirror,blendType=blend_type)
 def state():
  trans=[transition() for _ in range(r.count(4))];indices=r.unpack(f'{r.count(4)}i');trees=[[blend() for _ in range(r.count(4))] for _ in range(r.count(4))];ids=r.unpack('8I');speed,offset=r.unpack('2f');flags=r.unpack('4B');r.align();return dict(transitions=trans,indices=indices,trees=trees,nameId=ids[0],pathId=ids[1],fullPathId=ids[2],params=ids[4:],speed=speed,cycle=offset,flags=flags)
 layers=[]
 for _ in range(r.count(32)):
  index,motion=r.unpack('II');r.take(12);arr(8);r.take(12);r.take(2);r.align();layers.append((index,motion))
 machines=[]
 for _ in range(r.count(16)):
  states=[state() for _ in range(r.count(4))];anys=[transition() for _ in range(r.count(4))];selectors=[]
  for _ in range(r.count(4)):
   ts=[]
   for _ in range(r.count(8)):
    dest,=r.unpack('I');ts.append((dest,conditions()))
   full,entry=r.unpack('IB');r.align();selectors.append((full,entry,ts))
  default,motion=r.unpack('II');machines.append(dict(states=states,anys=anys,selectors=selectors,default=default,motion=motion))
 return r,machines,size,start

def resolve_controller(raw):
 r,machines,size,start=controller(raw);r.take(r.count(12)*12)
 for w in (12,16,12,4,4,1):r.take(r.count(w)*w)
 r.align();tos={}
 for _ in range(r.count(8)):
  k,=r.unpack('I');s=r.string();require(k not in tos,'duplicate controller string');tos[k]=s
 clips=[r.unpack('iq') for _ in range(r.count(12))];tail=raw[r.pos:];rows={}
 for mi,m in enumerate(machines):
  for t in m['anys']:
   cond=t['conditions']
   if len(cond)!=1:continue
   mode,key,threshold,exit=cond[0];trigger=tos.get(key,'')
   if not trigger.startswith('PhotoMode_Pose_'):continue
   dest=t['destination'];require(mode==1 and 0<=dest<len(m['states']) and trigger not in rows,'unsupported photo trigger');s=m['states'][dest];require(len(s['trees'])==1 and len(s['trees'][0])==1,'unsupported photo blend tree');tree=s['trees'][0][0];require(not tree['children'] and tree['clip']<len(clips) and not tree['mirror'] and s['speed']==1 and s['cycle']==0,'unsupported photo clip state');rows[trigger]=dict(state=tos[s['nameId']],fullPath=tos[s['fullPathId']],clip=clips[tree['clip']],clipIndex=tree['clip'],stateIndex=dest,machine=mi,loop=bool(s['flags'][2]),speed=s['speed'],cycle=s['cycle'],transitionDuration=t['duration'],transitionOffset=t['offset'])
 require(rows,'no photo states');return rows,len(tail)
