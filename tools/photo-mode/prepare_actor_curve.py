"""Apply the 11 converted companions using the alternate observed clip quality flag."""
import urllib.request
from prepare_actor_delta import ACTOR_SHA, apply_actor_archive
from prepare_actor_expansion import ACTOR_EXPANSION_SHA
from prepare_actor_bind import BIND_SHA
from prepare_player_expansion import EXPANSION_SHA
from prepare_player_complete import COMPLETE_SHA

CURVE_NAME="Dreamwish-Wand-companion-actor-curve-20261127.zip"
CURVE_URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+CURVE_NAME
CURVE_SHA="63382c636ebd4e89e0fdc081a61d574b256b6c54c601d9b1dea06cd6f0740bf8"
CURVE_BYTES=12444902

def download_curve():
    req=urllib.request.Request(CURVE_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(CURVE_BYTES+1)

def apply_curve(raw,dest):
    return apply_actor_archive(raw,dest,size=CURVE_BYTES,sha=CURVE_SHA,base_count=255,item_count=11,
                               schema="wand.photo-mode.companion-actor-curve@1",manifest="companion-actor-curve.json",
                               prior={"baseActorSha256":ACTOR_SHA,"baseExpansionSha256":EXPANSION_SHA,
                                      "baseCompleteSha256":COMPLETE_SHA,"baseActorExpansionSha256":ACTOR_EXPANSION_SHA,
                                      "baseActorBindSha256":BIND_SHA})
