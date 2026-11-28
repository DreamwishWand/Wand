"""Resolve exact original face-normal inputs and mask for private material diagnostics.
Do not publish original bundles or claim final shader parity.
"""
import argparse,json
from pathlib import Path
from resolve_animation_bundle import Reader,digest,unityfs,serialized_objects,container_entries
from pose_curves import require
from pose_material import decode_material,decode_texture
from export_face_morphs import config
PINS={
 "resources":"6085ded9a4449db200f64c5096960c0dae17f0891abc6fc4f6f7225d4ea126af",
 "male":"7712b04502a06254e04e5b0fe25aba2b9b9d56dc15a2fcfdc26b6f1b5e327960",
 "female":"38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8",
 "material":"854a3981667162d3a10b29b04b3755dfc89311dcf402540671fc0567413e2ccf"}
SHADERS={7864761196675705593:("Hidden/FaceNormalBlend","87dedd3a5ab3db46e0d904e460593f14f06cdf420b0ee2db6cdff71212598f8c"),4676528971231604548:("Custom/BakeMakeup","ec713abbb0e204cf99e3624d0d0324b4d395559a099479ed24d86726ec88f95f")}
ROLES=("eyes","nose","mouth","jaw")
def source(path,key):
 raw=path.read_bytes();require(digest(raw)==PINS[key],"source identity "+key);return raw
def serialized(data):
 version,objects=serialized_objects(data);require(version=="6000.0.62f1","serialized version")
 return {p:(c,data[o:o+n]) for p,(c,o,n) in objects.items()}
def bundle(raw):
 version,files=unityfs(raw,include_resources=True);require(version=="6000.0.62f1","bundle version")
 cabs=[n for n in files if not n.endswith(".resS")];require(len(cabs)==1,"serialized CAB count");return cabs[0],serialized(files[cabs[0]]),files
def texture(objects,files,pid,out,width,fmt,mips):
 cls,raw=objects[pid];require(cls==28,"texture class")
 info,png=decode_texture(raw,files)
 require((info["width"],info["height"],info["format"],info["mips"])==(width,width,fmt,mips),"native texture layout")
 name=info["pngSha256"]+".png";dest=out/name
 if dest.exists():require(dest.read_bytes()==png,"converted texture conflict")
 else:dest.write_bytes(png)
 return {**info,"pathId":str(pid),"file":name}
def export(resources,male,female,material,out):
 out=out.resolve();require(not any((p/".git").exists() for p in (out,*out.parents)),"private output outside Git")
 out.mkdir(parents=True,exist_ok=False)
 configs={}
 for cls,raw in serialized(source(resources,"resources")).values():
  if cls!=114 or len(raw)<32:continue
  r=Reader(raw);r.take(28)
  try:name=r.string()
  except (ValueError,UnicodeError):continue
  for b in ("male","female"):
   if name==b.title()+"AvatarConfig":require(b not in configs,"duplicate config");configs[b]=config(raw,b)
 require(set(configs)=={"male","female"},"missing configs")
 result={"schema":"wand.photo-mode.private-native-face-material-inputs@1","gameVersion":"1.26.2","privateOnly":True,"publicationAuthorized":False,"sourcePins":PINS,"fullPoseVerified":False,"bodies":{}}
 for b,path in (("male",male),("female",female)):
  cab,objects,files=bundle(source(path,b));entries={}
  for cls,raw in objects.values():
   if cls==142:
    for guid,(f,p) in container_entries(raw).items():
     require(guid not in entries,"duplicate address");entries[guid]=(f,p)
  refs={role:[row[2] for row in configs[b][role]] for role in ROLES}
  require(len(set(refs["eyes"]))==8 and all(r==refs["eyes"] for r in refs.values()),"unexpected normal config layout")
  textures={}
  for guid in refs["eyes"]:
   f,p=entries[guid];require(f==0,"external normal texture")
   textures[guid]=texture(objects,files,p,out,2048,12,12)
  result["bodies"][b]={"cab":cab,"references":refs,"textures":textures}
 cab,objects,files=bundle(source(material,"material"))
 materials={}
 for p,(cls,raw) in objects.items():
  if cls==21:
   r=Reader(raw);n=r.string()
   if n in ("normalBlend","BakeMakeup"):require(n not in materials,"duplicate material");materials[n]=(p,decode_material(raw))
 require(set(materials)=={"normalBlend","BakeMakeup"},"material coverage")
 for n,pid in (("normalBlend",7864761196675705593),("BakeMakeup",4676528971231604548)):
  m=materials[n][1];require(m["shader"]==[0,str(pid)],"material shader reference")
  cls,raw=objects[pid];label,sha=SHADERS[pid];require(cls==48 and digest(raw)==sha and label.encode() in raw,"shader source identity")
 mask=materials["normalBlend"][1]["textures"]["_FaceMask"];require(mask["fileId"]==0,"external face mask")
 result["mask"]=texture(objects,files,int(mask["pathId"]),out,1024,25,1)
 require(result["mask"]["name"]=="avatar_female_head_masks","mask name")
 result["materials"]={n:{"pathId":str(p),**m} for n,(p,m) in materials.items()}
 (out/"face-material-inputs.json").write_text(json.dumps(result,separators=(",",":"),allow_nan=False),encoding="utf-8")
 print("Native normal inputs: 16 textures, 64 resolved configuration references, 1 mask, 2 exact materials")
if __name__=="__main__":
 p=argparse.ArgumentParser(description=__doc__)
 for k in ("resources","male","female","material","out"):p.add_argument("--"+k,type=Path,required=True)
 a=p.parse_args();export(a.resources,a.male,a.female,a.material,a.out)
