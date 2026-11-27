"""Publish source-bound companion poses verified without requiring prefab and bind pose identity."""
import urllib.request
from prepare_actor_delta import ACTOR_SHA, apply_actor_archive
from prepare_actor_expansion import ACTOR_EXPANSION_SHA
from prepare_player_expansion import EXPANSION_SHA
from prepare_player_complete import COMPLETE_SHA

BIND_NAME = "Dreamwish-Wand-companion-actor-bind-20261127.zip"
BIND_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + BIND_NAME
BIND_SHA = "43714acf9436b25010beea5227c9bf137d8cb062dfcb83904e31c7b79180cd41"
BIND_BYTES = 94548083

def download_bind():
    request=urllib.request.Request(BIND_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=120) as response:
        return response.read(BIND_BYTES+1)

def apply_bind(raw,dest):
    return apply_actor_archive(raw,dest,size=BIND_BYTES,sha=BIND_SHA,base_count=255,item_count=77,variant_count=2,
                               schema="wand.photo-mode.companion-actor-bind@1",
                               manifest="companion-actor-bind.json",
                               prior={"baseActorSha256":ACTOR_SHA,"baseExpansionSha256":EXPANSION_SHA,
                                      "baseCompleteSha256":COMPLETE_SHA,"baseActorExpansionSha256":ACTOR_EXPANSION_SHA})
