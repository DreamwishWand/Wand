"""Publish three source-derived companion actors with verified native clip timing."""
import urllib.request
from prepare_actor_delta import apply_actor_archive
NAME="Dreamwish-Wand-companion-final-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="d6c786850034101e6b619b7547822020adb79ef3de200cae7f33e17636210ebe"
SIZE=8209207

def download_final():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:return response.read(SIZE+1)

def apply_final(raw,dest):
    return apply_actor_archive(raw,dest,size=SIZE,sha=SHA,base_count=263,item_count=3,
        schema="wand.photo-mode.final-companion-actors@1",manifest="companion-final.json",prior={},
        variant_count=2,secondary_count=5,shared_asset_count=2,native_loop_count=4,source_matched=True)
