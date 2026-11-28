"""Conservative source-derived opaque attachment profiles.
The supported clothing subset has null decal references and shader-declared black defaults.
The preview uses the existing studio's neutral global gloss scale (1), not a verified game global.
"""
from pose_curves import require
CAB='CAB-d79bfb1b074ecaf0c1e3e4fd94de319e'
PINS={
 '7527358103810511856':'956e8d032fa32c378ad3feedfd405ce2e73d6b31845290c55b4ba6fa2aca9ba4',
 '-8600332103802174571':'9982b8e01c8a7a1a4759d3108bb688375758b568b76d770dd06f6443273add31',
 '-1719385050964474045':'5da474f64881fcf246d9ec9a69e624a7bcf6221b64f94adf06d921bd188de864',
}
def profile(m,shader,shader_bytes,digest):
    require(shader[0]==CAB and shader[1] in PINS and digest(shader_bytes)==PINS[shader[1]],'unsupported shader identity')
    f,t,c=m['floats'],m['textures'],m['colors'];kw=m['validKeywords'];pid=shader[1]
    if pid=='7527358103810511856':
        require(f.get('_dst')==0 and f.get('_src')==1,'unsupported hair blend')
        return dict(shader='PBR/PBR Hair',dst=0,rawMaterialColors={k:c[k] for k in ('_BaseColor','_ColorOne','_ColorTwo','_ColorThree')}),'_MaskMap'
    tint=c['_Tint'];require(len(tint)==4 and all(0<=v<=1 for v in tint),'unsupported tint range')
    require(f.get('_AlphaClip')==0 and f.get('_Cull')==2,'unsupported alpha/cull state')
    if pid=='-8600332103802174571':
        require(kw==['_NORMALMAP'] and f.get('_EmissiveIntensity')==0 and f.get('_DstBlend')==0 and f.get('_SrcBlend')==1 and f.get('_ZWrite')==1,'unsupported generic state')
        metal,gloss=f['_Metallic'],f['_GlossMultiplier'];require(0<=metal<=4 and 0<=gloss<=4,'material scales')
        return dict(shader='PBR/PBR',dst=0,tint=tint,metallicScale=metal,glossScale=gloss),'_MainTex'
    require(not kw and all(t[k]['fileId']==0 and t[k]['pathId']=='0' for k in ('_DecalTex','_DecalMaps')),'unsupported clothing decal state')
    # The pinned serialized property table explicitly declares both defaults black.
    require(shader_bytes[536:545]==b'_DecalTex' and shader_bytes[596:601]==b'black' and shader_bytes[612:622]==b'_DecalMaps' and shader_bytes[672:677]==b'black','clothing default textures')
    return dict(shader='PBR/PBR Clothing',dst=0,tint=tint,metallicScale=1,glossScale=1,decalDefaultBlack=True),'_MainTex'
