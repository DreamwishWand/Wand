#!/usr/bin/env python3
"""Read-only sequential curl transport; keep TLS connections reusable across images."""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from email.parser import BytesHeaderParser
from urllib.error import URLError

from audit_native_map_cdn import ORIGIN, USER_AGENT, SHA, LIMIT, TOTAL, check


class CurlReader:
    def __init__(self, pending, objects, executable=None, *, http1=False):
        self.http1=http1
        self.pending=list(pending)
        self.sizes={s:objects['images/'+s+'.webp'] for s in self.pending}
        check(all(SHA.fullmatch(s) and type(n)==int and 20<=n<=LIMIT for s,n in self.sizes.items())
              and sum(self.sizes.values())<=TOTAL,'Invalid curl read scope')
        self.exe=executable or shutil.which('curl.exe') or shutil.which('curl')
        check(self.exe,'curl executable is required')
        self.proc=None
        self.temp=None
        self.err=None
        self.index=0

    def __enter__(self):
        return self

    def __exit__(self,*args):
        if self.proc is not None:
            if self.proc.poll() is None:
                self.proc.terminate()
                self.proc.wait(timeout=10)
            self.proc.stderr.close()
        if self.temp:self.temp.cleanup()

    def start(self):
        self.temp=tempfile.TemporaryDirectory(prefix='wand-cdn-curl-')
        self.root=Path(self.temp.name)
        # One curl process; --next keeps the connection cache but resets request options.
        commands=['fail-early']
        for i,s in enumerate(self.pending):
            if i:commands.append('next')
            if self.http1:commands.append('http1.1')
            commands += ['silent','show-error','fail','connect-timeout = 15','max-time = 120',
                'max-redirs = 0','proto = "=https"',
                f'max-filesize = {self.sizes[s]}',
                'header = "Accept: image/webp"','header = "Accept-Encoding: identity"',
                f'user-agent = "{USER_AGENT}"',
                f'url = "{ORIGIN}/images/{s}.webp"',
                f'dump-header = "{s}.headers"',f'output = "{s}.webp"',
                'write-out = "%{stderr}WAND %{http_code} %{num_connects}\\n"']
        cfg=self.root/'requests.cfg'
        cfg.write_text('\n'.join(commands)+'\n',encoding='ascii')
        self.proc=subprocess.Popen([self.exe,'-q','--config',str(cfg)],cwd=self.root,
                    stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)

    def __call__(self,sha,budget):
        check(self.index<len(self.pending) and self.pending[self.index]==sha,'Unexpected curl request order')
        n=self.sizes[sha]
        check(n<=budget[0],'Read budget exhausted')
        if self.proc is None:self.start()
        details=[]
        while True:
            entry=self.proc.stderr.readline()
            if not entry:break
            line=entry.decode('utf-8',errors='replace').strip()
            if line.startswith('WAND '):
                line=line[5:]
                break
            details.append(line[:240])
        else:line=''
        if not entry or not re.fullmatch(r'200 \d+',line):
            if self.proc.poll() is None:self.proc.terminate()
            code=self.proc.wait(timeout=10)
            raise URLError(f'curl exit={code}; HTTP/connection result={line if entry else "none"}; {"; ".join(details)[-240:]}')
        # Headers may include a proxy CONNECT response. Require the final HTTP response.
        raw_headers=(self.root/(sha+'.headers')).read_bytes()
        blocks=re.split(rb'\r?\n\r?\n',raw_headers)
        blocks=[b for b in blocks if b.startswith(b'HTTP/')]
        check(bool(blocks),'Missing HTTP response headers')
        status,_,headers=blocks[-1].partition(b'\n')
        check(re.match(rb'HTTP/\S+ 200(?:\s|$)',status),'Unexpected HTTP status')
        h=BytesHeaderParser().parsebytes(headers)
        check(h.get_content_type()=='image/webp','Unexpected Content-Type')
        check(h.get('Cache-Control')=='public, max-age=31536000, immutable','Cache policy mismatch')
        check(h.get('Content-Encoding','identity').lower()=='identity','Unexpected content encoding')
        if h.get('Content-Length') is not None:
            check(int(h['Content-Length'])==n,'Content-Length mismatch')
        p=self.root/(sha+'.webp')
        check(p.stat().st_size==n,'Downloaded length mismatch')
        raw=p.read_bytes()
        budget[0]-=len(raw)
        self.index+=1
        if self.index<=3:print('curl HTTP 200; new connections:',line.split()[1],flush=True)
        p.unlink()
        return raw
