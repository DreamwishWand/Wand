#!/usr/bin/env python3
"""One-pass private native map recovery from version-pinned Steam originals."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from audit_native_map_cdn import check
from encode_native_map_originals import private_path, write_json

HERE=Path(__file__).resolve().parent
FILES={
    'prefab':('menu-map-villagedata_assets_all.bundle','cdeff3ce9e896c5a8b84a9d889cab936f8e13048ad8fd904e0aae84f656d00a3'),
    'menu':('menu-map_assets_all.bundle','46bcfc84aa09ab9eb11e8b343a0bc3abf20d303683d01c3371aeba6f99be12b6'),
    'hires':('ui-images-menu-map-hires_assets_all.bundle','4b04c922d6d1eab53982f6756a4bee30b63734aa7dfbf8eff8d5e6c21c2a6734'),
    'lowres':('ui-images-menu-map-lowres_assets_all.bundle','ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f'),
}
MONO='c0f5d54d2b03116dfb757d70e84531c99f54b9e9698947ae7ced7645709f9107'
ASSEMBLY='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
SCENES={
    'scene-village04_scenes_all.bundle':'e6e817cd85bc188b8307dffd039e9f85e82155a8a9ef274b570f206a738b9525',
    'scene-villageexpansion01_scenes_all.bundle':'e5a2559695810b1c124a9320761c7703d41182989ff13e3681ee4fa32eb1a388',
    'scene-villageexpansion02_scenes_all.bundle':'f687cebe3bce88c964d771f46074ca7371b8919e4eddf0d23593308531328203',
    'scene-villageexpansion03_scenes_all.bundle':'97dcae437841cd415f3158aedb731f709137ad487573bf55cce377d9fdbfdcc6',
    'scene-villageexpansion04_scenes_all.bundle':'e7389b001e61e446cc7fa8364d70a1696319303dd65bb32d9897e553f561ae9f',
    'scene-villagewinniedlc_scenes_all.bundle':'af62df79d16a16c1145bb565c8958a6e5184b40be34f6a836039b518685a849c',
    'scene-expansion04_underwatertutorial_scenes_all.bundle':'0cb97e637ccaa2caec0a855d04e108cba9e2505043faa52c66ac53a659c92781',
    'scene-underwaterpirate_scenes_all.bundle':'7f8b2805ca66b96146a3d314b47140c4feba3f1d08b24d052faeba6d2f6a2b4f',
    'scene-underwatercandy_scenes_all.bundle':'d5e8e9d879b30bccf23dbcb8fba472efd437cc613738762edc137aa9ba343799',
    'scene-underwaterkingdom_scenes_all.bundle':'bfd7c986b5f549d5bd1f4159c456b51635ce1b38b6fcbea3cff3d4285649acb4',
}


def sha(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()


def verified(path, expected):
    check(path.is_file() and sha(path)==expected, 'Missing or changed Steam 1.26.2 source: '+str(path))
    return path


def sources(game):
    aa=game/'ddv_Data/StreamingAssets/aa/win'
    paths={k:verified(aa/name,digest) for k,(name,digest) in FILES.items()}
    mono=[p for p in sorted(aa.glob('*_monoscripts.bundle')) if sha(p)==MONO]
    check(len(mono)==1,'Expected exactly one matching MonoScript bundle')
    paths['mono']=mono[0]
    paths['assembly']=verified(game/'GameAssembly.dll',ASSEMBLY)
    paths['scenes']=[verified(aa/name,digest) for name,digest in SCENES.items()]
    return paths


def stage(p,build):
    # The caller uses a separate work directory for each source/tool identity.
    if p.exists():
        return json.loads(p.read_bytes())
    doc=build()
    write_json(p,doc)
    return doc


def run(game,out,reuse,node):
    from inspect_native_map_layout import extract
    from inspect_native_map_texture_refs import inspect as inspect_textures
    from build_native_map_geometry import build as geometry
    from build_native_map_lock_graph import build as locks
    from bind_native_map_images import bind
    from inspect_native_map_alpha import inspect as alpha
    from inspect_native_map_registration import build as registration
    from extract_native_lock_textures import extract as lock_texture
    from encode_native_map_from_bundles import run as encode
    from encode_native_map_originals import encode_one
    from audit_native_map_cdn import pixels
    out=private_path(out)
    game=game.resolve()
    check(not out.is_relative_to(game) and not game.is_relative_to(out),'Output must be separate from game')
    print('Checking original bundle hashes...',flush=True)
    p=sources(game)
    # Cache derives from exact extractor/renderer bytes and pinned source version.
    deps=sorted([*HERE.glob('*.py'),HERE/'build_native_map_private_preview.mjs',
                 HERE/'world-map-source-steam-1.26.2.json',HERE/'world-map-ocean-source-steam-1.26.2.json',
                 * (HERE.parent.parent/'src/lib/media').glob('native-map-*.ts')])
    tool_id=hashlib.sha256(''.join(sha(x) for x in deps).encode()).hexdigest()
    stage_root=out/'analysis'/tool_id
    stage_root.mkdir(parents=True,exist_ok=True)
    print('Preparing native map geometry, masks and projection...',flush=True)
    graph=stage(stage_root/'graph.json',lambda:extract(p['prefab'],p['mono']))
    tex=stage(stage_root/'hires.json',lambda:inspect_textures(p['hires']))
    geom=stage(stage_root/'geometry.json',lambda:geometry(graph,tex,p['lowres']))
    stage(stage_root/'locks.json',lambda:locks(graph,tex,p['prefab'],p['lowres']))
    stage(stage_root/'alpha.json',lambda:alpha(p['menu'],p['assembly']))
    reg=stage(stage_root/'registration.json',lambda:registration(p['menu'],p['prefab'],p['mono'],p['assembly'],p['scenes'],geom))
    ordinary=json.loads((HERE/'world-map-source-steam-1.26.2.json').read_bytes())
    ocean=json.loads((HERE/'world-map-ocean-source-steam-1.26.2.json').read_bytes())
    stage(stage_root/'binding.json',lambda:bind(geom,tex,ordinary,ocean))
    # These two lock assets need a roundtrip receipt in the existing native-plan builder.
    lock_root=stage_root/'lock-originals'
    (lock_root/'images').mkdir(parents=True,exist_ok=True)
    (lock_root/'receipts').mkdir(exist_ok=True)
    for target in ('hires','lowres'):
        def receipt():
            im,source=lock_texture(p[target],target)
            with im:
                # Stable lookup identity independent of compression version.
                meta={'kind':'texture','width':im.width,'height':im.height,'pixelSha256':pixels(im,'texture')}
                row=encode_one(meta['pixelSha256'],None,meta,lock_root,decoded=im)
            # Resolve the source pathID/CAB using the same original parser.
            return {'cab':source['cab'],'pathID':source['pathID'],'bundleSha256':source['bundleSha256'],'imageSha256':row['sha256'],
                    'roundtripVerified':True,'privateOnly':True,'publicationAuthorized':False}
        stage(stage_root/(target+'-receipt.json'),receipt)
    plan_path=stage_root/'plan.json'
    if not plan_path.exists():
        pending=plan_path.with_suffix('.tmp')
        pending.unlink(missing_ok=True)
        subprocess.run([node,'--experimental-strip-types',str(HERE/'build_native_map_private_preview.mjs'),
            *[str(stage_root/(s+'.json')) for s in ('graph','geometry','binding','locks','alpha','hires-receipt','lowres-receipt')],
            str(pending)],check=True)
        pending.replace(plan_path)
    plan=json.loads(plan_path.read_bytes())
    print('Checking and reusing original WebPs...',flush=True)
    result=encode(plan,reg,p['hires'],p['lowres'],out,[*reuse,lock_root])
    print(json.dumps({k:v for k,v in result.items() if k!='images'},indent=2),flush=True)
    return result


def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--game',type=Path,required=True)
    a.add_argument('--out',type=Path,required=True)
    a.add_argument('--reuse-dir',type=Path,action='append',default=[])
    a.add_argument('--node',default='node')
    p=a.parse_args()
    run(p.game,p.out,p.reuse_dir,p.node)


if __name__=='__main__':main()
