"""Publish source-derived companion motion diagnostics without claiming special shader parity."""
import urllib.request
from prepare_actor_delta import apply_actor_archive

NAME="Dreamwish-Wand-companion-limbo-diagnostic-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="c7908e9936fc91aa89912f5432d500bd65d1a079e66c86f6a91f0b9a28094ed4"
SIZE=4822686

def download_limbo():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(SIZE+1)

def apply_limbo(raw,dest):
    return apply_actor_archive(raw,dest,size=SIZE,sha=SHA,base_count=263,item_count=17,
                               geometry_count=17,schema="wand.photo-mode.companion-limbo-diagnostic@1",
                               manifest="companion-limbo-diagnostic.json",prior={})
