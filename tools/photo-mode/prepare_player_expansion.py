"""Second pinned player-pose expansion, applied after the independent actor overlay."""
import urllib.request
from prepare_companion_delta import DELTA_SHA, apply_player_archive

EXPANSION_NAME = "Dreamwish-Wand-companion-player-expansion-20261127.zip"
EXPANSION_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + EXPANSION_NAME
EXPANSION_SHA = "01ce2a2fb9b36c03177d09c884ba3a33b261195d0e562f47a8901b1a91e53ff6"
EXPANSION_BYTES = 10284930

def download_expansion():
    request=urllib.request.Request(EXPANSION_URL, headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read(EXPANSION_BYTES+1)

def apply_expansion(raw, dest):
    return apply_player_archive(raw, dest, sha=EXPANSION_SHA, size=EXPANSION_BYTES, base_count=107,
                                item_count=114, clip_count=32, pose_count=16,
                                schema="wand.photo-mode.companion-player-expansion@1", previous_sha=DELTA_SHA)
