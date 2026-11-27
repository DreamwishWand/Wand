"""Publish the next independently converted source-textured companion actor overlay."""
import urllib.request
from prepare_actor_delta import ACTOR_SHA, apply_actor_archive
from prepare_player_expansion import EXPANSION_SHA
from prepare_player_complete import COMPLETE_SHA

ACTOR_EXPANSION_NAME = "Dreamwish-Wand-companion-actor-expansion-20261127.zip"
ACTOR_EXPANSION_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + ACTOR_EXPANSION_NAME
ACTOR_EXPANSION_SHA = "b370f5840829f93d860b334a589949efc3fbd0dfaa657563dfce4e8b4675369b"
ACTOR_EXPANSION_BYTES = 100894337

def download_actor_expansion():
    request=urllib.request.Request(ACTOR_EXPANSION_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=120) as response:
        return response.read(ACTOR_EXPANSION_BYTES+1)

def apply_actor_expansion(raw,dest):
    return apply_actor_archive(raw,dest,size=ACTOR_EXPANSION_BYTES,sha=ACTOR_EXPANSION_SHA,
                               base_count=255,item_count=74,
                               schema="wand.photo-mode.companion-actor-expansion@1",
                               manifest="companion-actor-expansion.json",
                               prior={"baseActorSha256":ACTOR_SHA,"baseExpansionSha256":EXPANSION_SHA,
                                      "baseCompleteSha256":COMPLETE_SHA})
