"""Publish the native optimized-Avatar companion overlay."""
import urllib.request
from prepare_actor_delta import apply_actor_archive
NAME="Dreamwish-Wand-companion-lucky-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="54f2eb94b20745a783dd1e0b37555dd9ab05733770eed7d6bce4ff3df168348b"
SIZE=859384

def download_lucky():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:return response.read(SIZE+1)

def apply_lucky(raw,dest):
    return apply_actor_archive(raw,dest,size=SIZE,sha=SHA,base_count=263,item_count=1,
        schema="wand.photo-mode.lucky-actor@1",manifest="companion-lucky.json",prior={})
