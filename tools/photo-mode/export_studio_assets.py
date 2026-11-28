"""Rebuild the approved Steam 1.26.2 studio archive from its pinned original.

Offline Linux tool: Python 3.10+, lz4, Mesa EGL/OpenGL with BPTC support.
No game originals are copied into the output. A different source version,
BC6H decoder result, or ZIP encoder result fails closed, rather than silently
changing the approved release identity.
"""
import argparse
import ctypes as ct
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import zipfile

import lz4.block
from prepare_studio_assets import MANIFEST, NAME, SHA, SIZE


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_payload(source):
    require(digest(source) == MANIFEST['sourceSha256'], 'Wrong source bundle/version')
    # Offsets below belong ONLY to the SHA-pinned UnityFS v8 original.
    info = lz4.block.decompress(source[64:166], uncompressed_size=173)
    count = struct.unpack_from('>I', info, 16)[0]
    off, pos, blocks = 20, 176, []
    for _ in range(count):
        plain, packed, flags = struct.unpack_from('>IIH', info, off)
        off += 10
        chunk = source[pos:pos + packed]
        pos += packed
        codec = flags & 63
        require(codec in (0, 2, 3), 'Unexpected UnityFS compression')
        decoded = lz4.block.decompress(chunk, uncompressed_size=plain) if codec else chunk
        require(len(decoded) == plain, 'UnityFS block size')
        blocks.append(decoded)
    require(pos == len(source), 'UnityFS payload size')
    data = b''.join(blocks)
    count = struct.unpack_from('>I', info, off)[0]
    off += 4
    payload = None
    for _ in range(count):
        start, size, _flags = struct.unpack_from('>QQI', info, off)
        off += 20
        end = info.index(0, off)
        name = info[off:end].decode('ascii')
        off = end + 1
        if name == 'CAB-35aa0eca290c4a92dabdb99f21a74831.resS':
            require(payload is None and start + size <= len(data), 'Invalid resS range')
            payload = data[start:start + size]
    require(payload is not None, 'Missing studio resS')
    lut, cube = payload[:98304], payload[98304:]
    require(digest(lut) == MANIFEST['lut']['payloadSha256'], 'LUT original identity')
    require(digest(cube) == MANIFEST['reflection']['payloadSha256'], 'BC6H original identity')
    return lut, cube


def decode_bc6h(raw):
    require(sys.byteorder == 'little', 'Little-endian host required')
    os.environ['EGL_PLATFORM'] = 'surfaceless'
    os.environ['LIBGL_ALWAYS_SOFTWARE'] = '1'
    egl, gl = ct.CDLL('libEGL.so.1'), ct.CDLL('libGL.so.1')
    P, I, U = ct.c_void_p, ct.c_int, ct.c_uint

    def bind(lib, name, result, *args):
        f = getattr(lib, name)
        f.restype, f.argtypes = result, args
        return f

    display = bind(egl, 'eglGetDisplay', P, P)(None)
    major, minor = I(), I()
    require(bind(egl, 'eglInitialize', U, P, P, P)(display, ct.byref(major), ct.byref(minor)), 'EGL initialization failed')
    context = None
    current = bind(egl, 'eglMakeCurrent', U, P, P, P, P)
    try:
        require(bind(egl, 'eglBindAPI', U, U)(0x30A2), 'Desktop OpenGL unavailable')
        attrs = (I * 5)(0x3040, 8, 0x3033, 1, 0x3038)
        config, count = P(), I()
        require(bind(egl, 'eglChooseConfig', U, P, P, P, I, P)(display, attrs, ct.byref(config), 1, ct.byref(count)) and count.value, 'EGL config unavailable')
        context = bind(egl, 'eglCreateContext', P, P, P, P, P)(display, config, None, (I * 1)(0x3038))
        require(context and current(display, None, None, context), 'Surfaceless OpenGL unavailable')
        tex = U()
        bind(gl, 'glGenTextures', None, I, P)(1, ct.byref(tex))
        try:
            bind(gl, 'glBindTexture', None, U, U)(0x0DE1, tex)
            bind(gl, 'glPixelStorei', None, U, I)(0x0D05, 1)
            compressed = bind(gl, 'glCompressedTexImage2D', None, U, I, U, I, I, I, P)
            read = bind(gl, 'glGetTexImage', None, U, I, U, U, P)
            error = bind(gl, 'glGetError', U)
            pos, result = 0, []
            for face in range(6):
                for mip in range(8):
                    w = max(1, 128 >> mip)
                    size = ((w + 3) // 4) ** 2 * 16
                    block = raw[pos:pos + size]
                    pos += size
                    require(len(block) == size, 'Truncated BC6H mip')
                    compressed(0x0DE1, 0, 0x8E8F, w, w, 0, size, ct.c_char_p(block))
                    require(not error(), f'BC6H upload failed: {face}/{mip}')
                    pixels = ct.create_string_buffer(w * w * 6)
                    read(0x0DE1, 0, 0x1907, 0x140B, pixels)
                    require(not error(), f'BC6H decode failed: {face}/{mip}')
                    result.append(pixels.raw)
            require(pos == len(raw), 'Unexpected trailing BC6H bytes')
            return b''.join(result)
        finally:
            bind(gl, 'glDeleteTextures', None, I, P)(1, ct.byref(tex))
    finally:
        if context:
            current(display, None, None, None)
            bind(egl, 'eglDestroyContext', U, P, P)(display, context)
        bind(egl, 'eglTerminate', U, P)(display)


def export(source):
    lut, cube = source_payload(source)
    reflection = decode_bc6h(cube)
    payloads = [('studio-assets.json', json.dumps(MANIFEST, sort_keys=True, separators=(',', ':')).encode())]
    for key, ext, data in (('reflection', '.wlc', reflection), ('lut', '.wlt', lut)):
        entry = MANIFEST[key]['asset']
        require(len(data) == entry['bytes'] and digest(data) == entry['sha256'], f'{key} decoded identity')
        payloads.append((entry['sha256'] + ext, data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in payloads:
            info = zipfile.ZipInfo(name, (2026, 11, 28, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o600 << 16
            z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    result = out.getvalue()
    require(len(result) == SIZE and digest(result) == SHA, 'ZIP encoder differs from approved archive')
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--output', type=Path, default=Path(NAME))
    args = p.parse_args()
    result = export(args.source.read_bytes())
    with args.output.open('xb') as f:
        f.write(result)
    print(f'{args.output}: {len(result)} bytes, SHA256 {digest(result)}')


if __name__ == '__main__':
    main()
