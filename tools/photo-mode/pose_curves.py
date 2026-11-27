"""Decode the observed Unity 6000.0.62f1 nonlegacy pose clip layout privately."""
from bisect import bisect_right
from math import isfinite, floor
from resolve_animation_bundle import Reader, digest

DIMENSIONS = {1: 3, 2: 4, 3: 3, 4: 3}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def floats(r, count):
    v = r.unpack(f'{count}f')
    require(all(map(isfinite, v)), 'nonfinite float')
    return v

def array(r, size):
    return r.take(r.count(size)*size)

def decode(data):
    r = Reader(data)
    name = r.string()
    require(r.take(4) == bytes(4) and r.unpack('7i') == (0,)*7, 'unsupported explicit curve layout')
    rate, wrap = r.unpack('fi'); r.take(24); muscle_size, = r.unpack('I')
    require(isfinite(rate) and rate > 0 and muscle_size > 0, 'invalid clip header')
    r.take(68); array(r, 64)
    for _ in range(2):
        r.take(40); array(r, 4); r.take(16)
    array(r, 4); array(r, 12); r.take(172)
    stream = Reader(array(r, 4)); stream_count, = r.unpack('I')
    require(stream_count <= len(stream.data)//20, 'invalid streamed curve count')
    curves = [[] for _ in range(stream_count)]
    previous = -float('inf')
    while stream.pos < len(stream.data):
        t, = stream.unpack('f')
        require(t > previous, 'unordered streamed time'); previous = t
        keys = stream.count(20); seen = set()
        for _ in range(keys):
            idx, = stream.unpack('i'); coeff = floats(stream, 4)
            require(0 <= idx < stream_count and idx not in seen, 'invalid streamed key')
            seen.add(idx)
            if isfinite(t): curves[idx].append((t, coeff))
        if not isfinite(t): require(t == float('inf') and stream.pos == len(stream.data), 'invalid terminal frame')
    require(all(curves), 'missing streamed curve')
    frames, dense_count, dense_rate, begin = r.unpack('iIff')
    n = r.count(4)
    require(frames >= 0 and n == frames*dense_count and isfinite(dense_rate) and dense_rate > 0 and isfinite(begin), 'invalid dense layout')
    dense = floats(r, n); constant = floats(r, r.count(4))
    start, end, *_ = floats(r, 6)
    require(0 <= start < end, 'invalid duration')
    array(r, 4); delta = array(r, 8); array(r, 4)
    flags = r.take(11); r.align()
    require(all(x in (0,1) for x in flags), 'invalid clip flags')
    bindings = []; offset = 0
    for _ in range(r.count(28)):
        path, attr, fid, pid, cls, custom, ptr, integer, extra = r.unpack('IIiqiBBBB')
        dim = DIMENSIONS.get(attr, 1) if cls == 4 else 1
        bindings.append({'pathHash':path,'attribute':attr,'classId':cls,'customType':custom,'pointer':ptr,'integer':integer,'offset':offset,'dimensions':dim})
        offset += dim
    require(offset == stream_count+dense_count+len(constant) == len(delta)//8, 'binding scalar count mismatch')
    mappings = array(r, 12); root_flags = r.take(4)
    events = []
    for _ in range(r.count(32)):
        t, = floats(r, 1); fn = r.string(); param = r.string(); ref = r.unpack('iq'); value, = floats(r, 1); integer, options = r.unpack('ii')
        events.append({'time':t,'function':fn,'parameter':param,'objectRef':ref,'float':value,'int':integer,'options':options})
    require(r.pos == len(data), 'unparsed clip tail')
    return {'name':name,'sha256':digest(data),'sampleRate':rate,'start':start,'end':end,'loop':bool(flags[1]),'stream':curves,'dense':dense,'denseCount':dense_count,'denseFrames':frames,'denseRate':dense_rate,'denseBegin':begin,'constants':constant,'bindings':bindings,'events':events,'rootFlags':list(root_flags),'mappingCount':len(mappings)//12}

def sample(clip, seconds):
    require(isfinite(seconds), 'invalid sample time')
    t = max(clip['start'], min(clip['end'], seconds))
    values = []
    for curve in clip['stream']:
        i = max(0,bisect_right(curve,t,key=lambda key:key[0])-1)
        at,(a,b,c,d) = curve[i]
        dt = 0 if at < -1e30 else max(0,t-at)
        values.append(((a*dt+b)*dt+c)*dt+d)
    width = clip['denseCount']
    if width:
        x = max(0,min(clip['denseFrames']-1,(t-clip['denseBegin'])*clip['denseRate']))
        lo = floor(x); hi = min(lo+1,clip['denseFrames']-1); f=x-lo
        for i in range(width):
            a=clip['dense'][lo*width+i]; b=clip['dense'][hi*width+i]; values.append(a+(b-a)*f)
    values.extend(clip['constants'])
    require(all(map(isfinite,values)), 'nonfinite sample')
    return values
