/** Steam 1.26.2 diagnostic only. Derived from Owner's local decoded RGBA
 * histogram report and the published exact mask hashes. The dominant set
 * matches the expected bit count for 467 IDs; this is NOT native shader proof.
 * Pixels outside the exact one-hot set remain unresolved. */
export type MaskEvidenceRow=readonly [representativeItemId:number,shards:number,maskSha256:string,observedDominantBits:number,exactPixels:number,totalPixels:number];
export const MASK_PREVIEW_EVIDENCE:readonly MaskEvidenceRow[]=[
  [130000008,10,"015e98f755f4a09c75c7360a089fa85f018353c2c57e0512746cd4a6d79f4c70",10,582202,589824],
  [130000085,4,"01cce0104df7275955b4b375c28ca09a8924c7304b3d0aa7a6c8a2208c3d3347",4,571443,589824],
  [130000147,6,"0d6de1ebf8a429af704e0444eac10ff731eabaf8f41225eae692a60d5a668789",6,587400,589824],
  [130000288,2,"0f8ad3421131837ca77867967625898829ef2a9d89f9ea1023536cd100a92a3a",2,589824,589824],
  [130000011,10,"22f837e8a7f0da5a5374265a33bda97141123e687498010c560de94669457c2b",10,583056,589824],
  [130000003,10,"3a48753d0ca7f90fbdeb54ee109ce4106334417e82a586def0c43865238f15da",10,584534,589824],
  [130000146,3,"444aff5e5e8b1961008074e5d01509759b4acf9938dbb20877a83884e1bc8e90",3,578684,589824],
  [130000128,4,"5df1e2bda5c13469593abb4f23fb0ef896a781a1cd5528049a9001e172d7543f",4,588997,589824],
  [130000002,10,"72b1c33bf9968d98ca48b2cdfcad9dec97ab842b05a166bf14b10395b327b387",10,582557,589824],
  [130000516,10,"7efd4e60a6b4d339185fd50241e79b84879ddbff4b0e1a53a9e38f42bae97d6a",8,519657,524288],
  [130000004,10,"83bfd7d5e7989886c1bdcc03cec9649cfe4599eea8672322251aac1ac3070ae2",10,583393,589824],
  [130000009,10,"8c43181e21d19e0e0c6c5ba3f616c86fa69c83624109b23fcec51f52fd5f820e",10,582761,589824],
  [130000281,3,"9cd0c8e32950b9522135e1981883402034b535c8a4d10b81ed663eabc7885487",3,579386,589824],
  [130000015,10,"a13b8c713c7e8d0cda9ae60c26dc8636a0bb8ecd315b94f4329a99383ee2c4b6",10,583147,589824],
  [130000001,10,"a191715c1f5304709de29807d23e125857ba668ceb296fa4c5f29fe0b20dcaf6",10,582346,589824],
  [130000132,3,"ac696d05fa9a9e0812ca7cbcea6d9c2661c208fad78b06e977adb9eb840e48a4",3,588727,589824],
  [130000515,10,"ac696d05fa9a9e0812ca7cbcea6d9c2661c208fad78b06e977adb9eb840e48a4",3,588727,589824],
  [130000484,3,"c9c14f353379ba2e6b62f5a904935af1ba3575bcccdf222bb4131c720e6686b4",0,0,589824],
  [130000005,10,"d5cc1ee5b8d15040093aef73ce98f05bdd086a953fd69ee62a9bae0bb23b2ea1",10,582802,589824],
  [130000074,1,"e2242858b77ebf1ee0725e8b3568bb11dd6440d0c7d92c3b6a820ffcb240a59c",1,589824,589824],
  [130000010,10,"e3a9e03ea448d5d30f9f621e113f28538b0e838a4de87683f8e244db4688386f",10,579235,589824]
];
const index=new Map(MASK_PREVIEW_EVIDENCE.map(r=>[r[2]+':'+r[1],r]));
export function memoryMaskEvidence(sha:string,shards:number):MaskEvidenceRow|null{
  return index.get(sha+':'+shards)??null;
}
export function maskPreviewEligible(sha:string,shards:number):boolean{
  const row=memoryMaskEvidence(sha,shards);
  return row!==null&&row[1]===row[3];
}
/** Exact one-hot channel samples only. No threshold or boundary inference. */
export function exactMaskBit(r:number,g:number,b:number,a:number,shards:number):number|null{
  if(![r,g,b,a].every(v=>Number.isInteger(v)&&v>=0&&v<=255)||
     !Number.isInteger(shards)||shards<1||shards>10||b!==0||a!==255)return null;
  const bit=r+256*g;
  return bit>0&&(bit&(bit-1))===0&&bit<2**shards?bit:null;
}
