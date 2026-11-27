"""Apply independently verified rigid and body-specific companion actor projections."""
import urllib.request
from prepare_actor_delta import ACTOR_SHA, apply_actor_archive
from prepare_actor_expansion import ACTOR_EXPANSION_SHA
from prepare_actor_bind import BIND_SHA
from prepare_actor_curve import CURVE_SHA
from prepare_player_expansion import EXPANSION_SHA
from prepare_player_complete import COMPLETE_SHA
PARTIAL_NAME="Dreamwish-Wand-companion-actor-partial-20261127.zip"
PARTIAL_URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+PARTIAL_NAME
PARTIAL_SHA="b6561c9ec6a407421cd628620f926ffc156e360039ab9f2683e076efedba8214"
PARTIAL_BYTES=8074254

def download_partial():
    req=urllib.request.Request(PARTIAL_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(PARTIAL_BYTES+1)

def apply_partial(raw,dest):
    return apply_actor_archive(raw,dest,size=PARTIAL_BYTES,sha=PARTIAL_SHA,base_count=255,item_count=7,
                               partial_count=6,schema="wand.photo-mode.companion-actor-partial@1",
                               manifest="companion-actor-partial.json",
                               prior={"baseActorSha256":ACTOR_SHA,"baseExpansionSha256":EXPANSION_SHA,
                                      "baseCompleteSha256":COMPLETE_SHA,"baseActorExpansionSha256":ACTOR_EXPANSION_SHA,
                                      "baseActorBindSha256":BIND_SHA,"baseActorCurveSha256":CURVE_SHA})
