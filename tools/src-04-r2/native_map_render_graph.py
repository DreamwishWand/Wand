"""Structured render metadata for the inspected Steam 1.26.2 stripped UI fields.
No image bytes or native executable code in the output. Runtime visibility is not inferred.
"""
import math
import re
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def describe(name, payload, enabled, extern, cab):
    def size(n):
        require(len(payload) == n, f"Unexpected {name} field layout: {len(payload)}")
    def ints(offset, n=1):
        return list(struct.unpack_from('<'+'i'*n,payload,offset))
    def floats(offset, n):
        values=list(struct.unpack_from('<'+'f'*n,payload,offset))
        require(all(map(math.isfinite,values)),f"Nonfinite {name} fields")
        return values
    def ptr(offset):
        f,p=struct.unpack_from('<iq',payload,offset)
        require(0<=f<=len(extern),f"Invalid {name} external reference")
        if p==0:
            require(f==0,f"Unexpected {name} null reference")
            return None
        return {"cab":extern[f-1] if f else cab,"pathID":str(p)}
    d={"type":name,"enabled":bool(enabled)}
    if name in ('UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage','UnityEngine.UI.Image'):
        size({'UnityEngine.UI.RawImage':84,'Gameloft.UI.ExtendedRawImage':124,'UnityEngine.UI.Image':104}[name])
        d.update(material=ptr(0),rgba=floats(12,4),asset=ptr(56))
        if name=='UnityEngine.UI.Image':
            d['assetClass']='Sprite';d['imageType']=ints(68)[0]
            d['preserveAspect']=bool(payload[72])
        else:
            d['assetClass']='Texture2D';d['uvRect']=floats(68,4)
            if name=='Gameloft.UI.ExtendedRawImage':
                require(all(x in (0,1) for x in payload[84:88]),'Invalid flip/mirror flags')
                d['flipMirror']=list(map(bool,payload[84:88]))
                d['padding']=ints(88,4);d['spacing']=floats(104,2)
    elif name=='Gameloft.UI.AsyncRawImage':
        size(120);require(ints(0)[0]==32,'Unexpected asset GUID size')
        guid=payload[4:36].decode('ascii');require(re.fullmatch('[a-f0-9]{32}',guid),'Invalid asset GUID')
        d.update(guid=guid,fallbackTexture=ptr(100))
    elif name=='SoftMasking.SoftMask':
        size(116)
        d.update(shader=ptr(0),etc1Shader=ptr(12),source=ints(24)[0],separateMask=ptr(28),sprite=ptr(40),borderMode=ints(52)[0],pixelsPerUnitMultiplier=floats(56,1)[0],texture=ptr(60),uvRect=floats(72,4),channelWeights=floats(88,4),raycastThreshold=floats(104,1)[0],invertMask=bool(payload[108]),invertOutsides=bool(payload[109]))
    elif name=='SoftMasking.SoftMaskable':
        size(0)
    elif name=='Mdl.Ui.MapVillageArea':
        require(len(payload)>=32,'Truncated MapVillageArea')
        n=ints(28)[0];require(0<=n<=1000 and len(payload)==32+12*n,'Invalid area blocker list')
        d.update(areaType=ints(0)[0],canvasGroup=ptr(4),areaNameCanvasGroup=ptr(16),blockers=[ptr(32+i*12) for i in range(n)])
    else:
        return None
    return d


def classify(hierarchy, components):
    """Classify layer role, not visibility or a runtime draw decision."""
    h=hierarchy.split('/')
    if len(h)<2:
        return None
    types={c['type']:c for c in components}
    if not set(types)&{'UnityEngine.UI.Image','UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage'}:
        return None
    if h[1]=='QuestAreaMarkers':
        return 'quest-marker'
    background=h[1]=='Background' or (h[0] in ('MapVillage04','MapVillageExpansion1') and not h[1].startswith(('AreaNames','BiomeNames','MapVillage')))
    if not background:
        return None
    if 'SoftMasking.SoftMaskable' in types or h[-1]=='MapLockedBiomeOverlay':
        return 'lock-overlay'
    if 'Gameloft.UI.AsyncRawImage' in types:
        return 'async-background'
    graphic=next(c for c in components if c['type'] in ('UnityEngine.UI.Image','UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage'))
    if graphic['type']=='UnityEngine.UI.Image' and graphic['asset'] is None and graphic['material'] is None:
        return 'solid-background'
    if graphic['type'] in ('UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage') and graphic['asset'] and graphic['material']:
        return 'material-texture-background'
    return 'unclassified-background'
