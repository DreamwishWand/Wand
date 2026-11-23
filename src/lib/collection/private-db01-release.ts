/** Independently audited v1.26.2 DB-01 owner-local release fingerprint.
 * Metadata only. No private game records, user Save or ZIP asset paths.
 */
export const DB01_PRIVATE_RELEASE = Object.freeze({
  platform:'Steam' as const,gameVersion:'1.26.2' as const,
  manifestSha256:'3a0236a0b98c0772dd8458f96bacb0bdd3859bdfdf3947ba98dcabd54647b271',
  nativeSourceManifestSha256:'1ebf71a19792bb2293a710cec533b1471e4e4f2c0e695a9d413bbcfc305022f6',
  sourceItemsSha256:'f809dc5aa3783942a1e01b90ac2d24755c5d9f692650d3a6fe2f5738934946da',
});
export type Db01PrivateReleasePin=Readonly<{
  platform:string;gameVersion:string;
  manifestSha256:string;nativeSourceManifestSha256:string;
  sourceItemsSha256:string;
}>;
