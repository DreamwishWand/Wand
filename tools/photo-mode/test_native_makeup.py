"""Source-layout regression tests, using synthetic fixtures only."""
import struct
import unittest
from unittest.mock import patch
from export_native_makeup import extract_items, extract_palette, int32, SUBTYPES
from pose_material import read_streamed_texture

def vi(value):
    value %= 2**64
    out = bytearray()
    while value >= 128:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)

def field(n, w, value):
    tag=vi(n*8+w)
    if w==0:
        return tag+vi(value)
    if w==2:
        return tag+vi(len(value))+value
    if w==5:
        return tag+struct.pack("<f",value)
    raise ValueError(w)

def fixture():
    rows=[]
    index=0
    for subtype,count in SUBTYPES.items():
        for i in range(count):
            item=140000000+100000*subtype+i
            refs=[f"guid:{2*index+j:032x}".encode() for j in range(2)]
            colors=[-1 if 3*index+j<77 else 0 for j in range(3)]
            raw=field(1,0,item)+field(7,2,refs[0])+field(8,2,refs[1])
            raw+=b"".join(field(n,0,c) for n,c in zip((9,10,11),colors) if c!=0)
            raw+=field(12,5,0.75)
            rows.append(raw)
            index+=1
    return b"".join(vi(i)+vi(len(v))+v for i,v in enumerate(rows))

def string(s):
    data=s.encode()
    return struct.pack("<i",len(data))+data+bytes((-len(data))%4)

def texture(fmt,mips=1):
    width=height=8
    block=8 if fmt in (10,26) else 16
    sizes=[((max(1,width>>i)+3)//4)*((max(1,height>>i)+3)//4)*block for i in range(mips)]
    size=sum(sizes)
    cab="CAB-"+"a"*32
    resource=cab+".resS"
    path="archive:/"+cab+"/"+resource
    raw=string("test")+struct.pack("<7I",0,width,height,size,0,fmt,mips)+bytes(64)
    raw+=struct.pack("<QI",8,size)+string(path)
    payload=bytes(range(size))
    return raw,{resource:bytes(8)+payload},payload,sizes

class NativeMakeupTests(unittest.TestCase):
    def test_signed_and_default_color_fields(self):
        rows=extract_items(fixture())
        self.assertEqual(len(rows),69)
        self.assertEqual(sum(c==-1 for r in rows.values() for c in r["defaultColorIndices"]),77)
        self.assertTrue(all(r["defaultGloss"]==0 and r["defaultOpacity"]==0.75 for r in rows.values()))
        self.assertEqual(int32(2**64-1),-1)
        self.assertEqual(int32(2**64-2**31),-2**31)
        with self.assertRaises(ValueError):
            int32(2**31)
        with self.assertRaises(ValueError):
            extract_items(fixture()[:-1])
    def test_palette_preserves_alpha_and_all_bytes(self):
        palette=bytes(range(256))+bytes(range(44))
        raw=bytes(28)+string("AvatarMakeupColorConfig")+struct.pack("<i",75)+palette
        with patch("export_native_makeup.objects",return_value={1:(114,raw)}):
            _,out=extract_palette(b"")
        self.assertEqual(bytes(x for color in out for x in color),palette)
        with patch("export_native_makeup.objects",return_value={1:(114,raw[:-1])}):
            with self.assertRaises(ValueError):
                extract_palette(b"")
    def test_native_bc_mip_chain_preserves_payload(self):
        for fmt in (10,12,25,26):
            for mips in (1,4):
                with self.subTest(fmt=fmt,mips=mips):
                    raw,resources,payload,sizes=texture(fmt,mips)
                    info,actual,lengths=read_streamed_texture(raw,resources)
                    self.assertEqual(info["format"],fmt)
                    self.assertEqual(actual,payload)
                    self.assertEqual(lengths,sizes)
                    truncated={k:v[:-1] for k,v in resources.items()}
                    with self.assertRaises(ValueError):
                        read_streamed_texture(raw,truncated)
    def test_unknown_format_rejected(self):
        raw,resources,_,_=texture(27)
        with self.assertRaises(ValueError):
            read_streamed_texture(raw,resources)

if __name__=="__main__":
    unittest.main()
