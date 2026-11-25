"""Reproduce public numeric Scene facts from the SHA-pinned original.
Usage: python export_original_scene_facts.py Scene.json output.json
No raw message, name, dialogue or other game asset is copied.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import json

SOURCE = 'd8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5'
OUTPUT = '830a0b42835d12957ba5f8c41bbc5c8f30ea4e17c69dcd5a0a92c764f85f9149'

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        require(pos < len(data), 'VARINT_EOF')
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError('VARINT_OVERFLOW')

def fields(data):
    pos = 0
    while pos < len(data):
        key, pos = varint(data, pos)
        field, wire = key >> 3, key & 7
        require(field > 0, 'FIELD')
        if wire == 0:
            value, pos = varint(data, pos)
        else:
            if wire == 2:
                length, pos = varint(data, pos)
            elif wire in (1, 5):
                length = 8 if wire == 1 else 4
            else:
                raise ValueError('WIRE')
            require(pos + length <= len(data), 'FIELD_LENGTH')
            value = data[pos:pos + length]
            pos += length
        yield field, wire, value

def extract(data):
    require(sha256(data).hexdigest() == SOURCE, 'SOURCE_SHA')
    rows, pos = [], 0
    while pos < len(data):
        frame, pos = varint(data, pos)
        size, pos = varint(data, pos)
        require(size > 0 and pos + size <= len(data), 'FRAME_LENGTH')
        item_ids, types, tags = [], [], []
        for n, w, v in fields(data[pos:pos + size]):
            if n == 1:
                require(w == 0, 'ID_WIRE')
                item_ids.append(v)
            elif n == 6:
                require(w == 0 and 0 <= v <= 14, 'TYPE_WIRE')
                types.append(v)
            elif n == 17:
                require(w in (0, 2), 'TAG_WIRE')
                if w == 0:
                    tags.append(v)
                else:
                    j = 0
                    while j < len(v):
                        tag, j = varint(v, j)
                        tags.append(tag)
        require(item_ids == [1540000000 + frame] and len(types) <= 1, 'IDENTITY')
        rows.append([item_ids[0], types[0] if types else None, tags])
        pos += size
    rows.sort()
    require(len(rows) == len({r[0] for r in rows}) == 194, 'SCENE_CENSUS')
    require(sum(r[1] is not None for r in rows) == 193 and sum(bool(r[2]) for r in rows) == 5, 'FACT_CENSUS')
    output = (json.dumps(rows, separators=(',', ':')) + '\n').encode()
    require(sha256(output).hexdigest() == OUTPUT, 'OUTPUT_SHA')
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_bytes(extract(args.source.read_bytes()))
