"""Complete all decoded normal-body companion poses, including native alternate triggers."""
import urllib.request
from prepare_companion_delta import DELTA_SHA, apply_player_archive
from prepare_player_expansion import EXPANSION_SHA
COMPLETE_NAME = "Dreamwish-Wand-companion-player-complete-20261127.zip"
COMPLETE_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + COMPLETE_NAME
COMPLETE_SHA = "843d46eecc820c315e46f5e6c6d76c407f9b2a7e4d855b98bae1f6827d7f0806"
COMPLETE_BYTES = 15269015

def download_complete():
    req=urllib.request.Request(COMPLETE_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(COMPLETE_BYTES+1)

def apply_complete(raw,dest):
    return apply_player_archive(raw,dest,sha=COMPLETE_SHA,size=COMPLETE_BYTES,base_count=221,
                                item_count=34,clip_count=60,pose_count=30,
                                schema="wand.photo-mode.companion-player-final@1",
                                previous_sha=DELTA_SHA,expansion_sha=EXPANSION_SHA,variant_count=4)
