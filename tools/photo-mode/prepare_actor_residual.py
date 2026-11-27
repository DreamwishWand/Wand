"""Publish the five source-textured residual actors as explicitly incomplete material previews."""
import urllib.request
from prepare_actor_delta import apply_actor_archive
NAME="Dreamwish-Wand-companion-residual-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="1cedbafc977c62c9d77ce4656ea087e525add261c8ce9face8902c15edaf3b6b"
SIZE=5800187

def download_residual():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(SIZE+1)

def apply_residual(raw,dest):
    return apply_actor_archive(raw,dest,size=SIZE,sha=SHA,base_count=263,item_count=5,
                               secondary_count=5,schema="wand.photo-mode.companion-residual@1",
                               manifest="companion-residual.json",prior={})
