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
        pair=(f.get('_src'),f.get('_dst'));require(pair in ((1,0),(5,10)),'unsupported hair blend')
        state=dict(shader='PBR/PBR Hair',dst=int(pair[1]),rawMaterialColors={k:c[k] for k in ('_BaseColor','_ColorOne','_ColorTwo','_ColorThree')})
        if pair==(5,10):
            require(m['queue'] in (-1,3000),'unsupported hair render queue')
            require(digest(shader_bytes[1744:2940])=='2a160e87959756e472a8fcb22cb850ef5fe8855ddbee8e0e2fcec5a13f2edbf9','hair forward blend/depth state')
            state['renderQueue']=2000 if m['queue']==-1 else 3000
        return state,'_MaskMap'
    tint=c['_Tint'];require(len(tint)==4 and all(0<=v<=1 for v in tint),'unsupported tint range')
    if pid=='-8600332103802174571':
        cutout='_ALPHATEST_ON' in kw
        require(kw in (['_NORMALMAP'],['_ALPHATEST_ON','_NORMALMAP']) and f.get('_AlphaClip')==int(cutout) and f.get('_Cull') in (0,2) and f.get('_EmissiveIntensity')==0 and f.get('_DstBlend')==0 and f.get('_SrcBlend')==1 and f.get('_ZWrite')==1,'unsupported generic state')
        metal,gloss=f['_Metallic'],f['_GlossMultiplier'];require(0<=metal<=4 and 0<=gloss<=4,'material scales')
        return dict(shader='PBR/PBR',dst=0,tint=tint,metallicScale=metal,glossScale=gloss,cull=int(f['_Cull']),alphaCutout=cutout),'_MainTex'
    require(f.get('_AlphaClip')==0 and f.get('_Cull')==2,'unsupported clothing alpha/cull state')
    require(not kw and all(t[k]['fileId']==0 and t[k]['pathId']=='0' for k in ('_DecalTex','_DecalMaps')),'unsupported clothing decal state')
    # The pinned serialized property table explicitly declares both defaults black.
    require(shader_bytes[536:545]==b'_DecalTex' and shader_bytes[596:601]==b'black' and shader_bytes[612:622]==b'_DecalMaps' and shader_bytes[672:677]==b'black','clothing default textures')
    return dict(shader='PBR/PBR Clothing',dst=0,tint=tint,metallicScale=1,glossScale=1,decalDefaultBlack=True),'_MainTex'
