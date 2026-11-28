"""Resolve source skinned attachments against the actual avatar rig.

Uses the existing Unity mesh decoder and skinning math. Selects a geometry
root by exact bone path hashes, not filename or transform names alone.
Extra attachment bones retain their source local TRS. Raw geometry and
unresolved material references are private until the rendering path is verified.
"""
from zlib import crc32
import numpy as np
from resolve_animation_bundle import Reader, digest, unityfs, serialized_objects
from pose_mesh import decode_mesh
from pose_deform import world
from pose_curves import require
from pose_material import externals, decode_material


def extract_attachment(raw, prefab_guid, body):
    version, files = unityfs(raw)
    require(version == '6000.0.62f1' and len(files) == 1, 'unsupported attachment bundle')
    cab, data = next(iter(files.items()))
    version, objects = serialized_objects(data)
    require(version == '6000.0.62f1', 'unsupported attachment serialized file')
    ext = externals(data)
    names, transforms, entries = {}, {}, []
    def obj(pid, cls):
        c, s, n = objects[pid]
        require(c == cls, 'object class mismatch')
        return data[s:s+n]
    for pid,(cls,s,n) in objects.items():
        r = Reader(data[s:s+n])
        if cls == 1:
            refs = [r.unpack('iq') for _ in range(r.count(12))]
            r.take(4)
            names[pid] = (r.string(), refs)
        elif cls == 4:
            f,g = r.unpack('iq')
            q,t,scale = r.unpack('4f'),r.unpack('3f'),r.unpack('3f')
            children = [r.unpack('iq') for _ in range(r.count(12))]
            parent = r.unpack('iq')
            require(f == 0 and r.pos == n, 'invalid attachment transform')
            transforms[pid] = (g,q,t,scale,children,parent)
        elif cls == 142:
            r.string()
            total = r.count(12)
            r.take(total*12)
            for _ in range(r.count(24)):
                key = r.string()
                start,count,f,p = r.unpack('iiiq')
                require(0 <= start <= total and 0 <= count <= total-start, 'invalid preload range')
                if key == prefab_guid and f == 0 and p in objects and objects[p][0] == 1:
                    entries.append(p)
    roots = [p for p,(g,q,t,s,kids,par) in transforms.items() if g in entries and par == (0,0)]
    require(len(roots) == 1, 'missing or ambiguous catalog prefab root')

    def hierarchy(root):
        rows, lookup = [], {}
        def walk(pid,path,parent):
            require(pid in transforms and pid not in lookup, 'invalid attachment hierarchy')
            g,q,t,s,kids,_ = transforms[pid]
            require((0,pid) in names[g][1], 'broken attachment backlink')
            i = len(rows)
            lookup[pid] = i
            rows.append(dict(path=path,pathHash=crc32(path.encode()),parent=parent,rotation=q,translation=t,scale=s,gameObject=g,pathId=str(pid)))
            for f,k in kids:
                require(f == 0 and k in transforms and transforms[k][-1] == (0,pid), 'broken attachment child')
                walk(k,(path+'/' if path else '')+names[transforms[k][0]][0],i)
        walk(root,'',-1)
        require(len({n['path'] for n in rows}) == len(rows), 'duplicate attachment path')
        return rows,lookup

    logical, lookup = hierarchy(roots[0])
    reverse = {i:p for p,i in lookup.items()}
    nodes = [dict(n) for n in body]
    shared = {n['path']:i for i,n in enumerate(nodes)}
    require(len(shared) == len(nodes), 'duplicate avatar path')
    original_count = len(nodes)
    parts = []
    def material_ref(f,pid):
        require(0 <= f <= len(ext) and pid != 0, 'invalid attachment material')
        asset = cab if f == 0 else ext[f-1].rsplit('/',1)[-1]
        return dict(assetFile=asset,pathId=str(pid),material=decode_material(obj(pid,21)) if f == 0 else None)
    for i,node in enumerate(logical):
        for f,pid in names[node['gameObject']][1]:
            if f or objects[pid][0] != 137:
                continue
            r = Reader(obj(pid,137))
            require(r.unpack('iq') == (0,node['gameObject']), 'broken renderer backlink')
            r.pos = 72
            materials = [r.unpack('iq') for _ in range(r.count(12))]
            r.take(56)
            mf,mp = r.unpack('iq')
            bones = [r.unpack('iq') for _ in range(r.count(12))]
            weights = r.unpack(f'{r.count(4)}f')
            root = r.unpack('iq')
            r.take(28)
            require(mf == 0 and root[0] == 0 and bones and all(f==0 for f,_ in bones) and r.pos==len(r.data), 'unsupported renderer layout')
            m = decode_mesh(obj(mp,43))
            # Unity MeshRenderer: remaining material slots render the final
            # submesh again. Preserve the ordered draws, including repeats.
            # https://docs.unity3d.com/ja/2021.2/Manual/class-MeshRenderer.html
            require(0<len(m['indices'])<=len(materials), 'material/submesh mismatch')
            if len(materials)>len(m['indices']):
                m['indices'] = m['indices'] + [m['indices'][-1]]*(len(materials)-len(m['indices']))
            matches = []
            a = i
            while a >= 0:
                rows,by_pid = hierarchy(reverse[a])
                if root[1] in by_pid and all(b in by_pid for _,b in bones):
                    if tuple(rows[by_pid[b]]['pathHash'] for _,b in bones)==m['boneHashes'] and rows[by_pid[root[1]]]['pathHash']==m['rootHash']:
                        matches.append((rows,by_pid))
                a = logical[a]['parent']
            require(len(matches)==1,'missing or ambiguous native geometry root')
            rows,by_pid = matches[0]
            renderer_index = by_pid[reverse[i]]
            source_joints = [by_pid[b] for _,b in bones]
            source_world = world(rows)
            source_transform = source_world[renderer_index]
            source_error = float(np.max(np.abs(source_world[source_joints]@m['bind']-source_transform)))
            require(source_error < 1e-4,'native attachment bind mismatch')
            def ensure(idx):
                n = rows[idx]
                path = n['path']
                if path in shared:
                    j = shared[path]
                    if j >= original_count:
                        require(all(np.allclose(nodes[j][k],n[k],atol=1e-6,rtol=0) for k in ('translation','rotation','scale')), 'incompatible attachment bone')
                    return j
                require(n['parent'] >= 0, 'attachment has no shared ancestor')
                parent = ensure(n['parent'])
                j = len(nodes)
                shared[path] = j
                nodes.append({k:v for k,v in n.items() if k!='gameObject'} | {'parent':parent})
                return j
            joints = [ensure(j) for j in source_joints]
            combined_error = float(np.max(np.abs(world(nodes)[joints]@m['bind']-source_transform)))
            require(combined_error < 1e-4, 'attachment bind differs on selected avatar')
            parts.append(dict(mesh=m,rendererPathId=str(pid),meshPathId=str(mp),geometryRootPathId=rows[0]['pathId'],meshTransform=source_transform,joints=joints,materials=[material_ref(f,p) for f,p in materials],weights=weights,sourceBindError=source_error,combinedBindError=combined_error))
    require(parts, 'no supported skinned renderer')
    return dict(prefabGuid=prefab_guid,sourceBundleSha256=digest(raw),assetFile=cab,nodes=nodes,extraBoneCount=len(nodes)-original_count,parts=parts,secondaryMotionVerified=False,shaderParityVerified=False)
