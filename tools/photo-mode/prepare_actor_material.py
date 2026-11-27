"""Apply seven source-validated companion models, including six base-pass diagnostic projections."""
import urllib.request
from prepare_actor_delta import ACTOR_SHA, apply_actor_archive
from prepare_actor_expansion import ACTOR_EXPANSION_SHA
from prepare_actor_bind import BIND_SHA
from prepare_actor_curve import CURVE_SHA
from prepare_actor_partial import PARTIAL_SHA
from prepare_player_expansion import EXPANSION_SHA
from prepare_player_complete import COMPLETE_SHA
MATERIAL_NAME="Dreamwish-Wand-companion-actor-material-20261127.zip"
MATERIAL_URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+MATERIAL_NAME
MATERIAL_SHA="c9046fcee1fb04052b0739cdef8ea142006517009c49c942677c3d4717005ae4"
MATERIAL_BYTES=8032666

def download_material():
    req=urllib.request.Request(MATERIAL_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(MATERIAL_BYTES+1)

def apply_material(raw,dest):
    return apply_actor_archive(raw,dest,size=MATERIAL_BYTES,sha=MATERIAL_SHA,base_count=255,item_count=7,
                               secondary_count=6,schema="wand.photo-mode.companion-actor-material@1",
                               manifest="companion-actor-material.json",
                               prior={"baseActorSha256":ACTOR_SHA,"baseExpansionSha256":EXPANSION_SHA,
                                      "baseCompleteSha256":COMPLETE_SHA,"baseActorExpansionSha256":ACTOR_EXPANSION_SHA,
                                      "baseActorBindSha256":BIND_SHA,"baseActorCurveSha256":CURVE_SHA,
                                      "baseActorPartialSha256":PARTIAL_SHA})
