"""Private UnityFS v8 / SerializedFile v22 animation object reader.
Only the observed little-endian, stripped-type-tree format is supported.
This extracts original clip objects, not decoded curves or playable GLB.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Reader:
    def __init__(self, data, endian='<'):
        self.data, self.endian, self.pos = data, endian, 0

    def take(self, n):
        if n < 0 or self.pos + n > len(self.data):
            raise ValueError('truncated data')
        start = self.pos
        self.pos += n
        return self.data[start:self.pos]

    def unpack(self, fmt):
        fmt = self.endian + fmt
        return struct.unpack(fmt, self.take(struct.calcsize(fmt)))

    def align(self, n=4):
        self.take((-self.pos) % n)

    def cstring(self):
        end = self.data.index(0, self.pos)
        return bytes(self.take(end-self.pos+1)[:-1]).decode('utf-8')

    def string(self):
        size, = self.unpack('i')
        value = bytes(self.take(size)).decode('utf-8')
        self.align()
        return value

    def count(self, min_size):
        n, = self.unpack('i')
        if n < 0 or n * min_size > len(self.data)-self.pos:
            raise ValueError('invalid array count')
        return n


def unityfs(raw, include_resources=False):
    import lz4.block
    r = Reader(raw, '>')
    if r.cstring() != 'UnityFS' or r.unpack('I') != (8,):
        raise ValueError('unsupported UnityFS version')
    r.cstring(); revision = r.cstring()
    total, packed, unpacked, flags = r.unpack('QIII')
    if total != len(raw) or flags & ~0x243 or flags & 0x3f not in (0, 2, 3):
        raise ValueError('unsupported UnityFS layout')
    r.align(16)
    def decompress(data, codec, size):
        result = data if codec == 0 else lz4.block.decompress(data, uncompressed_size=size) if codec in (2, 3) else None
        if result is None or len(result) != size:
            raise ValueError('invalid compression block')
        return result
    info = Reader(decompress(r.take(packed), flags & 63, unpacked), '>')
    info.take(16)
    blocks = [info.unpack('IIH') for _ in range(info.count(10))]
    nodes = [(info.unpack('QQI'), info.cstring()) for _ in range(info.count(21))]
    if info.pos != len(info.data) or sum(x[0] for x in blocks) > 512*1024*1024:
        raise ValueError('invalid or excessive bundle size')
    if flags & 0x200:
        r.align(16)
    body = bytearray()
    for size, stored, codec in blocks:
        body.extend(decompress(r.take(stored), codec & 63, size))
    if r.pos != len(raw):
        raise ValueError('unexpected trailing bundle bytes')
    files = {}
    for (offset, size, kind), name in nodes:
        if offset + size > len(body) or name in files:
            raise ValueError('invalid bundle node')
        if kind & 4 or (include_resources and name.endswith(".resS")):
            files[name] = bytes(body[offset:offset+size])
    return revision, files


def serialized_objects(data):
    header = Reader(data, '>')
    _, _, version, _ = header.unpack('IIII')
    if version != 22 or header.take(4) != b'\0'*4:
        raise ValueError('unsupported serialized file version/endianness')
    meta, size, offset, _ = header.unpack('IQQQ')
    if size != len(data) or not header.pos + meta <= offset <= size:
        raise ValueError('invalid serialized header')
    r = Reader(data[header.pos:header.pos+meta])
    revision = r.cstring(); r.unpack('i')
    if r.take(1) != b'\0':
        raise ValueError('type tree present; use UnityPy')
    classes = []
    for _ in range(r.count(23)):
        cls, stripped, script = r.unpack('iBh')
        if cls == 114:
            r.take(16)
        r.take(16)
        classes.append(cls)
    objects = {}
    for _ in range(r.count(24)):
        r.align()
        pid, start, length, ti = r.unpack('qQIi')
        if pid in objects or not 0 <= ti < len(classes) or offset+start+length > size:
            raise ValueError('invalid serialized object')
        objects[pid] = (classes[ti], offset+start, length)
    return revision, objects


def container_entries(data):
    r = Reader(data)
    r.string()
    preloads = r.count(12)
    r.take(preloads*12)
    result = {}
    for _ in range(r.count(24)):
        key = r.string()
        start, count, file_id, path_id = r.unpack('iiiq')
        if key in result or start < 0 or count < 0 or start+count > preloads:
            raise ValueError('invalid asset container entry')
        result[key] = (file_id, path_id)
    return result


def read_bundle(path, guids, out=None):
    raw = path.read_bytes()
    sha = digest(raw)
    unity, files = unityfs(raw)
    result = {}
    for name, data in files.items():
        revision, objects = serialized_objects(data)
        if revision != unity:
            raise ValueError('Unity version mismatch')
        for cls, offset, size in objects.values():
            if cls != 142:
                continue
            for key, (file_id, pid) in container_entries(data[offset:offset+size]).items():
                if key not in guids or file_id != 0 or pid not in objects:
                    continue
                cls_id, start, length = objects[pid]
                if cls_id != 74:
                    continue
                if key in result:
                    raise ValueError('ambiguous clip GUID')
                clip = data[start:start+length]
                clip_name = Reader(clip).string()
                clip_hash = digest(clip)
                result[key] = {'sourceBundleSha256': sha, 'sourceBundle': path.name,
                               'assetFile': name, 'pathId': str(pid), 'class': 'AnimationClip',
                               'clipName': clip_name, 'clipSha256': clip_hash, 'bytes': length,
                               'unityVersion': revision, 'curvesDecoded': False}
                if out is not None:
                    dest = out / (clip_hash+'.clip.bin')
                    if dest.exists():
                        if digest(dest.read_bytes()) != clip_hash:
                            raise ValueError('existing clip hash mismatch')
                    else:
                        with dest.open('xb') as f:
                            f.write(clip)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--census', type=Path, required=True)
    p.add_argument('--bundle', type=Path, action='append', required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--extract', action='store_true')
    a = p.parse_args()
    out = a.out.resolve()
    if any((x/'.git').exists() for x in (out, *out.parents)):
        raise ValueError('private output must stay outside Git')
    census = json.loads(a.census.read_bytes())
    if census.get('schema') != 'wand.photo-mode.private-source-census@1' or census.get('publicationAuthorized') is not False:
        raise ValueError('private source census required')
    expected = {}
    for guid, rows in census['locations'].items():
        clips = [x for x in rows if x['class']=='AnimationClip']
        if len(clips)==1:
            expected[guid] = {v.replace('\\','/').rsplit('/',1)[-1] for v in clips[0]['dependencies']}
    out.mkdir(parents=True, exist_ok=True)
    manifest = out/'animation-objects.json'
    if manifest.exists():
        raise FileExistsError(manifest)
    result = {}
    for bundle in a.bundle:
        name = bundle.name.removesuffix('.bin')
        guids = {g for g, paths in expected.items() if name in paths}
        if not guids:
            raise ValueError('bundle is not a census dependency: '+name)
        found = read_bundle(bundle, guids, out if a.extract else None)
        if result.keys() & found.keys():
            raise ValueError('ambiguous GUID across source bundles')
        result.update(found)
    with manifest.open('x', encoding='utf-8') as f:
        json.dump({'schema':'wand.photo-mode.private-animation-objects@1','privateOnly':True,
                   'publicationAuthorized':False,'gameVersion':census['gameVersion'],
                   'objects':result,'unresolvedGuids':sorted(expected.keys()-result.keys())},f,indent=2)
    print(f'{len(result)}/{len(expected)} exact clip objects resolved; curve conversion not performed')

if __name__=='__main__':
    main()
