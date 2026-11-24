# One-time flat R2 media migration

Current final key: `images/<encoded SHA-256>.webp`. Public bucket: `dreamwishwand-media`.
This operator tool consumes the locally verified Steam 1.26.2 private staging report and
item overlay (13,202 items). It also recognizes existing public canonical/legacy
content-addressed WebP keys in the exact known image namespaces. Unclassified public
objects are counted, not copied or deleted. A mismatch in trusted SHA metadata, size,
MIME or canonical cache headers stops the run instead of guessing. Actual live
object census, unknown public keys, missing shared media and CDN delivery remain
to be verified. No bucket visibility changes or deletions.

Use existing Windows SRC-04 output and local R2 credentials for **both** buckets.
Do not paste secrets into chat. Use the scoped read-only credential for PLAN where
possible; APPLY needs object write permission in the public bucket and read access
to source buckets. Run from a current checkout of Wand with Python 3, boto3 and Pillow.

```powershell
# Current account usage must be checked in the dashboard first.
# Example conservative per-run caps, NOT a guarantee against billing.
py -3 tools/src-04-r2/migrate_flat_public.py plan --plan "$env:USERPROFILE\Documents\DreamwishWand\src04-flat-plan.json" --max-a 100 --max-b 50000 --max-bytes 0
```

The plan makes LIST and HEAD requests, no copies. Return only the printed summary,
not the private plan. Check actual plan usage, projected apply requests and added
bytes against current account-wide usage, including other workloads. The copy
estimate assumes no concurrent uploads. A lower budget aborts before writes.
After approval use the exact plan SHA printed by PLAN; choose explicit limits.
```powershell
py -3 tools/src-04-r2/migrate_flat_public.py apply --plan "$env:USERPROFILE\Documents\DreamwishWand\src04-flat-plan.json" --plan-sha PLAN_SHA --receipt "$env:USERPROFILE\Documents\DreamwishWand\src04-flat-inventory.json" --approve I_APPROVE_PUBLIC_IMAGE_MIGRATION --max-a APPROVED_A --max-b APPROVED_B --max-bytes APPROVED_BYTES
```
Copies use source ETag and R2's destination-if-none-match condition, replace metadata
with public cache headers and retain source bytes. Restart with the same plan:
verified existing destinations are skipped; no automatic retries or deletions.
The receipt records canonical key and byte count, **metadata verification only**;
it is not a CDN-readback or release activation report. Run representative public
GET checks before publishing indexes. No deletion until all required game-art
coverage and actual client references are verified. Noncanonical shared media
not yet uploaded must be recovered from verified local source; never blindly
copy private files. Future releases use direct final-key uploads.

R2 reference: https://developers.cloudflare.com/r2/api/s3/conditional-operations/
