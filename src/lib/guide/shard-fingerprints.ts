/** Exact owner-original Steam v1.26.1 32 quest-detail shard file fingerprints.
 * All 32 were read in full and all 733 indexed quest records independently
 * matched their canonical per-record SHA-256. No game text is distributed.
 * Original Mission source is full-byte SHA-equivalent to Steam v1.26.2.
 */
export const ORIGINAL_GUIDE_SHARD_SOURCE_VERSION = '1.26.1' as const;
export const ORIGINAL_GUIDE_SHARD_AUDIT_SHA = '99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf' as const;
export const ORIGINAL_GUIDE_SHARD_TOTAL_BYTES = 98001716 as const;
export const ORIGINAL_GUIDE_SHARD_FILE_SHA:Readonly<Record<string,string>> = Object.freeze({
  'part-00.json': '32af2babef912a63a1a153a498fc7bc39fcf0b0e21b347e11363cefc5e7fb084',
  'part-01.json': '7b6aea72092c6d5f91895831394cbc973048d0c2a3940cede551ae212de4b4e1',
  'part-02.json': 'e80a7685d781df1521e9cac0dde853c3daa320ed4013dbcf7aed4375f77d3367',
  'part-03.json': 'f04cdbe3ba4c3494803aa6f9c10cba0471f7a6b6c0b264fc4871cbb4730eda42',
  'part-04.json': '3e30c2b27649342d4fe30d4a5631417355b3c3a2858a51e4feb5820cc1c2cf54',
  'part-05.json': '209b0d1d43aedd9256a865b5e853427249b40c6fec225cdee9bedf0f1358f868',
  'part-06.json': 'ee661e162bc21a3ebbfe16daad14137331e868a3c305f8e0ea75d4abb4056779',
  'part-07.json': 'cbe751d61f663cf3d70a8b229b56a75c332f2ef2644c769bcb8870b6bb33ec91',
  'part-08.json': 'aad58b2dcc720f360ffd11291797338aab507cbd2a0c0fa4f674e938ac8519ec',
  'part-09.json': '42a0fde47c2384b2a986dd8b691e232a06a9fe43e8d9e192791129a9dec80a80',
  'part-10.json': 'efd9a7a5c36e76fcb0bef8301cc1f447600cd322331a464025c836941d83be77',
  'part-11.json': 'd7cf4f325b292e1f8ea1dc69b3b060a9a47f459c06eee458fd96491af013deda',
  'part-12.json': '6ca3a14214cc175a3dd6c536e2a46000d6de9a7b0674fb5cad5c7629dd1d2a1e',
  'part-13.json': '132711080cd9e88cefc8dca1cb5eedce2824c220bc629f53affe4765d5573fbc',
  'part-14.json': '452a2ed90b5e6aa72e5ffb8915611ee5230dfddc4eecbb1c0f27398ee46518ff',
  'part-15.json': '29f3c31a7b67d00f5278d056d75061be1c7eca0f56d7a51675a84132d3b76701',
  'part-16.json': '5725923d8abfe4bd0556faad61393679a333007b56c7e5d105fd65949e358c67',
  'part-17.json': '1444ed80b4b8f93c427fe7b2c5af51d86e2718f331e0850e18a13ede8fc75c71',
  'part-18.json': '42411791262430612f5124df2fb4e40afbd8a07878ed0fcd8c1da5d017d557cc',
  'part-19.json': '9a84f41914628712dc56f06a8a80c13246a4f4a04c88caaaa2499146ecc0fc9c',
  'part-20.json': '2c1ded2afbdded7392dadb9dcc8cc8db330a0762d78afb69e3bf794ed5a6be5c',
  'part-21.json': '1692b9381757b833b6e9b28cb9f9a01d69cfde1593ae4ad8660cf5823f244d34',
  'part-22.json': 'f8cce7267a8b481ebe787903839c516d8a6ab3422415ec33504aa276afc9ab52',
  'part-23.json': '09dd960b7bd9685176ff8379e248ec80518fbbad69b4d31ab58f31307ec0133a',
  'part-24.json': 'fa70094cf8701fc942bca0e287a20b5fb4a35b5e6ace41c403e1ee4e4841d97c',
  'part-25.json': 'c8a0909a2e5a082d6a431f630dfdbf43028e645fcdc5c6400a670b6ba538d3d3',
  'part-26.json': 'c8fc9f830294453f1321d6699dbfd4ed698301b710ecd499b85c4a51c6b9b64b',
  'part-27.json': '2bf276b2ea402dc45944cbc501cd3a74816b838860cc6f33819d8e72ae33fbc4',
  'part-28.json': 'cc53a59815ff2dc6eb7dba5e102d962dfb16962783d7f665324363c7756cbee0',
  'part-29.json': '01dbcb8f8e7bdbc6060b8c07070419cab8c1ebe8b74c76eb46ec8f56453e90da',
  'part-30.json': '0a8b6cff141170f5d5121f091c12b3863e57df094cf4dd1f7a4cd23c7bc84333',
  'part-31.json': 'a2aceb5bb5cc06c80b8888efa1cfa2ecf14bc3594e01d2afd2168b7aa7fcd62e',
});

/** Exact 32-record source ledger: canonical names, not current public
 * 8-shard Quest projections. No private source records are distributed.
 */
const ORIGINAL_SHARD_FILE=/^part-(?:0[0-9]|[12][0-9]|3[01])\.json$/;
const SHA256=/^[a-f0-9]{64}$/;
export const ORIGINAL_GUIDE_SHARD_FILE_NAMES:readonly string[]=Object.freeze(
  Object.keys(ORIGINAL_GUIDE_SHARD_FILE_SHA).sort()
);
if(ORIGINAL_GUIDE_SHARD_FILE_NAMES.length!==32||
  ORIGINAL_GUIDE_SHARD_FILE_NAMES.some((name,index)=>
    name!=='part-'+String(index).padStart(2,'0')+'.json'||
    !ORIGINAL_SHARD_FILE.test(name)||
    !SHA256.test(ORIGINAL_GUIDE_SHARD_FILE_SHA[name])))
  throw new TypeError('Guide: incomplete original 32-part source ledger');

/** Only returns a known SHA-256 for the exact owner-original shard.
 * Unknown paths, __proto__, traversal, duplicate extension and invalid
 * part indices are all rejected before any source file can be read.
 */
export function expectedOriginalGuideShardSha(fileName:unknown):string{
  if(typeof fileName!=='string'||!ORIGINAL_SHARD_FILE.test(fileName)||
    !Object.hasOwn(ORIGINAL_GUIDE_SHARD_FILE_SHA,fileName))
    throw new TypeError('Guide: unknown owner-original shard name');
  return ORIGINAL_GUIDE_SHARD_FILE_SHA[fileName];
}

