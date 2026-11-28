"""Assemble approved Pages test assets from a verified transfer prefix.

The input consists exclusively of converted preview assets, not game bundles.
Transfer fragments are not copied into the deployed site.
"""
import argparse, hashlib, json, struct, zlib
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def prepare(source,dest):
    m=json.loads((source/'index.json').read_bytes())
    assert m['schema']=='wand.photo-mode.pages-test@1' and m['publicationAuthorized'] is True and m['testOnly'] is True and m['fullPoseVerified'] is False
    pins=json.loads((source/'parts.json').read_bytes())
    chunks=[]
    for p in pins:
        data=(source/p['name']).read_bytes()
        assert len(data)==p['bytes'] and sha(data)==p['sha256'],'transfer integrity'
        chunks.append(data)
    raw=b''.join(chunks)
    assets={}
    for item,options in m['items'].items():
        for body,o in options.items():
            assert body in m['bodyIcons'] and o['kind']=='pair'
            entry=o['asset'];assets[entry['sha256']+'.glb']=(item,o)
    pos=0;found={}
    while pos+30<=len(raw) and raw[pos:pos+4]==b'PK\x03\x04':
        sig,version,flags,method,mtime,mdate,crc,compressed,size,nlen,xlen=struct.unpack_from('<4s5H3I2H',raw,pos)
        start=pos+30+nlen+xlen;end=start+compressed
        if end>len(raw):break
        assert not flags&9 and method in (0,8),'unsupported zip entry'
        name=raw[pos+30:pos+30+nlen].decode().rsplit('/',1)[-1]
        if name in assets:
            assert name not in found,'duplicate asset'
            item,o=assets[name];entry=o['asset'];assert size==entry['bytes'] and size<=64*1024*1024
            data=zlib.decompress(raw[start:end],-15) if method==8 else raw[start:end]
            assert len(data)==size and sha(data)==entry['sha256'] and zlib.crc32(data)==crc,'asset integrity'
            assert data[:4]==b'glTF' and struct.unpack_from('<I',data,8)[0]==len(data)
            n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);a=doc['animations'][0]['extras']
            assert a['sourceSha256']==o['sourceSha256'] and a['companionItemId']==int(item) and doc['asset']['extras']['attachedPairDiagnostic'] is True,'scene identity'
            found[name]=data
        pos=end
    assert set(found)==set(assets),'missing complete scene'
    for entry in m['bodyIcons'].values():
        name=entry['sha256']+'.png';data=(source/name).read_bytes()
        assert len(data)==entry['bytes'] and sha(data)==entry['sha256'] and data[:8]==b'\x89PNG\r\n\x1a\n','icon integrity'
        found[name]=data
    dest.mkdir(parents=True,exist_ok=True)
    for name,data in found.items():
        (dest/name).write_bytes(data)
    (dest/'index.json').write_text(json.dumps(m,separators=(',',':')),encoding='utf-8')
    print('Pages test scenes',sum(len(v) for v in m['items'].values()),'assets',len(found),'bytes',sum(map(len,found.values())))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,help='Explicit legacy two-scene transfer fixture')
    p.add_argument('--archive',type=Path,help='Local copy of pinned diagnostic release')
    p.add_argument('--companion-delta',type=Path,help='Local copy of the pinned companion delta')
    p.add_argument('--actor-delta',type=Path,help='Local copy of the pinned companion actor delta')
    p.add_argument('--player-expansion',type=Path,help='Local copy of the second player-motion expansion')
    p.add_argument('--player-complete',type=Path,help='Local copy of the remaining player poses')
    p.add_argument('--actor-expansion',type=Path,help='Local copy of the second actor overlay')
    p.add_argument('--actor-bind',type=Path,help='Local copy of the native-bind actor overlay')
    p.add_argument('--actor-curve',type=Path,help='Local copy of the curve-flag actor overlay')
    p.add_argument('--actor-partial',type=Path,help='Local copy of rigid and body-specific actor overlay')
    p.add_argument('--props',type=Path,help='Local copy of native accessory overlay')
    p.add_argument('--actor-material',type=Path,help='Local copy of base material pass actor overlay')
    p.add_argument('--euler-correction',type=Path,help='Local copy of corrected native rotation clips')
    p.add_argument('--mermaid',type=Path,help='Local copy of mermaid geometry and motion diagnostics')
    p.add_argument('--max-alternate',type=Path,help='Local copy of the second native Max pose')
    p.add_argument('--limbo-geometry',type=Path,help='Local copy of the limbo companion geometry diagnostic overlay')
    p.add_argument('--actor-residual',type=Path,help='Local copy of source-textured residual companion overlay')
    p.add_argument('--actor-final',type=Path,help='Local copy of final three companion actors')
    p.add_argument('--actor-lucky',type=Path,help='Local copy of optimized Avatar companion overlay')
    p.add_argument('--ariel-prop',type=Path,help='Local copy of the original Ariel rock accessory overlay')
    p.add_argument('--mermaid-materials',type=Path,help='Local copy of source-derived mermaid base materials')
    p.add_argument('--avatar-materials',type=Path,help='Local copy of shared source avatar base materials')
    p.add_argument('--skin-palette',type=Path,help='Local copy of all original skin base-color assets')
    p.add_argument('--eyes',type=Path,help='Local copy of the approved native eye masks and colors')
    p.add_argument('--face-morphs',type=Path,help='Local copy of the approved face morph archive')
    p.add_argument('--head-geometry',type=Path,help='Local copy of the approved head geometry archive')
    p.add_argument('--body-morphs',type=Path,help='Local copy of the approved body morph archive')
    p.add_argument('--dest',type=Path,default=Path('static/photo-mode-preview'))
    a=p.parse_args()
    if a.source:
        if a.archive or a.companion_delta or a.actor_delta or a.player_expansion or a.player_complete or a.actor_expansion or a.actor_bind or a.actor_curve or a.actor_partial or a.props or a.actor_material or a.euler_correction or a.mermaid or a.max_alternate or a.limbo_geometry or a.actor_residual or a.actor_final or a.actor_lucky or a.ariel_prop or a.mermaid_materials or a.avatar_materials or a.skin_palette or a.eyes or a.face_morphs or a.head_geometry or a.body_morphs: p.error('--source cannot be combined with release archives')
        prepare(a.source,a.dest)
    else:
        from prepare_release_preview import download, project
        project(a.archive.read_bytes() if a.archive else download(), a.dest)
        from prepare_companion_delta import download_delta, apply_delta
        apply_delta(a.companion_delta.read_bytes() if a.companion_delta else download_delta(), a.dest)
        from prepare_actor_delta import download_actors, apply_actors
        apply_actors(a.actor_delta.read_bytes() if a.actor_delta else download_actors(), a.dest)
        from prepare_player_expansion import download_expansion, apply_expansion
        apply_expansion(a.player_expansion.read_bytes() if a.player_expansion else download_expansion(), a.dest)
        from prepare_player_complete import download_complete, apply_complete
        apply_complete(a.player_complete.read_bytes() if a.player_complete else download_complete(), a.dest)
        from prepare_actor_expansion import download_actor_expansion, apply_actor_expansion
        apply_actor_expansion(a.actor_expansion.read_bytes() if a.actor_expansion else download_actor_expansion(), a.dest)
        from prepare_actor_bind import download_bind, apply_bind
        apply_bind(a.actor_bind.read_bytes() if a.actor_bind else download_bind(), a.dest)
        from prepare_actor_curve import download_curve, apply_curve
        apply_curve(a.actor_curve.read_bytes() if a.actor_curve else download_curve(), a.dest)
        from prepare_actor_partial import download_partial, apply_partial
        apply_partial(a.actor_partial.read_bytes() if a.actor_partial else download_partial(), a.dest)
        from prepare_photo_props import download_props, apply_props
        apply_props(a.props.read_bytes() if a.props else download_props(), a.dest)
        from prepare_actor_material import download_material, apply_material
        apply_material(a.actor_material.read_bytes() if a.actor_material else download_material(), a.dest)
        from prepare_euler_correction import download_euler, apply_euler
        apply_euler(a.euler_correction.read_bytes() if a.euler_correction else download_euler(), a.dest)
        from prepare_mermaid_preview import download_mermaid, apply_mermaid
        apply_mermaid(a.mermaid.read_bytes() if a.mermaid else download_mermaid(), a.dest)
        from prepare_max_alternate import download_max, apply_max
        apply_max(a.max_alternate.read_bytes() if a.max_alternate else download_max(), a.dest)
        from prepare_limbo_geometry import download_limbo, apply_limbo
        apply_limbo(a.limbo_geometry.read_bytes() if a.limbo_geometry else download_limbo(), a.dest)
        from prepare_actor_residual import download_residual, apply_residual
        apply_residual(a.actor_residual.read_bytes() if a.actor_residual else download_residual(), a.dest)

        from prepare_actor_final import download_final, apply_final
        apply_final(a.actor_final.read_bytes() if a.actor_final else download_final(), a.dest)

        from prepare_actor_lucky import download_lucky, apply_lucky
        apply_lucky(a.actor_lucky.read_bytes() if a.actor_lucky else download_lucky(), a.dest)

        from prepare_skunk_native_loops import apply_skunk_native_loops
        apply_skunk_native_loops(a.dest)

        from prepare_ariel_prop import download_ariel,apply_ariel
        apply_ariel(a.ariel_prop.read_bytes() if a.ariel_prop else download_ariel(),a.dest)

        from prepare_mermaid_base_materials import download_materials,apply_materials
        apply_materials(a.mermaid_materials.read_bytes() if a.mermaid_materials else download_materials(),a.dest)

        from prepare_avatar_base_materials import download_avatar_materials,apply_avatar_materials
        base_source=apply_avatar_materials(a.avatar_materials.read_bytes() if a.avatar_materials else download_avatar_materials(),a.dest)

        from prepare_avatar_skin_palette import download_skin_palette,apply_skin_palette
        apply_skin_palette(a.skin_palette.read_bytes() if a.skin_palette else download_skin_palette(),a.dest,base_source)

        from prepare_avatar_eyes import download_eyes,apply_eyes
        apply_eyes(a.eyes.read_bytes() if a.eyes else download_eyes(),a.dest)

        from prepare_face_morphs import download_face_morphs,apply_face_morphs
        morph_source=apply_face_morphs(a.face_morphs.read_bytes() if a.face_morphs else download_face_morphs(),a.dest,base_source)

        from prepare_head_geometry import download_heads,apply_heads
        apply_heads(a.head_geometry.read_bytes() if a.head_geometry else download_heads(),a.dest,base_source,morph_source)

        from prepare_body_morphs import download_body_morphs,apply_body_morphs
        apply_body_morphs(a.body_morphs.read_bytes() if a.body_morphs else download_body_morphs(),a.dest,base_source)
