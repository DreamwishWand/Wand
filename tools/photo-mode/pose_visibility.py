"""Recover avatar material section names from the original IL2CPP static initializer."""
import argparse,json,re,subprocess
from pathlib import Path
from resolve_animation_bundle import digest
from pose_curves import require

def extract_parts(binary,literals,dump):
    text=dump.read_text(encoding='utf-8-sig')
    match=re.search(r'public static class AvatarPartsDefinition\b.*?// RVA: (0x[0-9A-Fa-f]+)[^\n]*VA: (0x[0-9A-Fa-f]+)\s+public static string GetFullName\(int name, int bodyPart, int section\).*?// RVA: (0x[0-9A-Fa-f]+)[^\n]*VA: (0x[0-9A-Fa-f]+)\s+private static void \.cctor\(\)',text,re.S)
    require(match is not None,'missing native AvatarPartsDefinition')
    rva,va,ctor_rva,ctor_va=map(lambda x:int(x,16),match.groups());base=va-rva;require(ctor_va-ctor_rva==base and va<ctor_va,'invalid method range')
    # The next class method supplies the upper bound. The validated pattern below
    # accepts only the observed x64 initializer with contiguous literal arrays.
    following=re.search(r'// RVA: (0x[0-9A-Fa-f]+)[^\n]*VA: (0x[0-9A-Fa-f]+)',text[match.end():]);require(following is not None,'no following method');end=int(following[2],16);require(ctor_va<end<=ctor_va+0x1000,'unexpected initializer bounds')
    vals={base+int(x['address'],16):x['value'] for x in json.loads(literals.read_bytes())}
    def disasm(start,end):
        return subprocess.check_output(['objdump','-d',f'--start-address={start:#x}',f'--stop-address={end:#x}',str(binary)],text=True)
    dis=disasm(ctor_va,end)
    pattern=r'mov\s+[^\n]*\(%rip\),%r8\s*#\s*(0x[0-9a-f]+)[^\n]*\n[^\n]*(?:xor\s+%edx,%edx|mov\s+\$(0x[0-9a-f]+),%edx)\s*\n[^\n]*mov\s+%(?:rax|rbx),%rcx\s*\n[^\n]*call\s+(0x[0-9a-f]+)'
    arrays=[];fn=None
    for m in re.finditer(pattern,dis):
        addr,idx,call=m.groups();idx=int(idx,16) if idx else 0;addr=int(addr,16);require(addr in vals,'missing string literal')
        if fn is None:fn=call
        require(call==fn,'unexpected array assignment function')
        if idx==0:arrays.append([])
        require(arrays and idx==len(arrays[-1]),'noncontiguous initializer');arrays[-1].append(vals[addr])
    require(list(map(len,arrays))==[9,14,2] and all(len(set(a))==len(a) and all(re.fullmatch('[a-z]+',x) for x in a) for a in arrays),'unexpected native part arrays')
    fmt=disasm(va,ctor_va);seps=[vals.get(int(a,16)) for a in re.findall(r'mov\s+[^\n]*\(%rip\),%r8\s*#\s*(0x[0-9a-f]+)',fmt)];require(seps==['__','__'],'unexpected native material separator')
    return dict(names=arrays[0],bodyParts=arrays[1],sections=arrays[2],separator='__',initializerRva=hex(ctor_rva),formatRva=hex(rva),binarySha256=digest(binary.read_bytes()),literalSha256=digest(literals.read_bytes()))

def material_name(mapping,part):
    items=[]
    for key,table in [('name','names'),('bodyPart','bodyParts'),('section','sections')]:
        i=part[key];require(type(i) is int and 0<=i<len(mapping[table]),'invalid part index');items.append(mapping[table][i])
    return mapping['separator'].join(items)

def selected_hidden(mapping,items):
    hidden=set();unhidden=set()
    for item in items:
        hidden.update(material_name(mapping,p) for p in item['categoryHiddenParts'])
        for option in item['selectedOptions']:
            hidden.update(material_name(mapping,p) for p in option['hiddenParts']);unhidden.update(material_name(mapping,p) for p in option['unhiddenParts'])
    require(not unhidden,'outfits with unhide rules need runtime precedence verification')
    return hidden

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--binary',type=Path,required=True);p.add_argument('--literals',type=Path,required=True);p.add_argument('--dump',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');r=extract_parts(a.binary,a.literals,a.dump);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x') as f:json.dump(dict(privateOnly=True,publicationAuthorized=False,**r),f,separators=(',',':'))
    print(r['names'],r['bodyParts'],r['sections'])
if __name__=='__main__':main()
