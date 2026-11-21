/**
 * DB-05 owner-private DutyAch milestone -> saved numeric witness bridge.
 * Only exact source-native ID matches may be compared. Output contains no
 * source IDs, reward IDs, claimed values, saved values, or localized strings.
 * This is NOT a completion/claimability/entitlement/reward assessment.
 */
import spec from '../../../data/ddv/save/duty-milestone-wire-contract.v1.json' with {type:'json'};
import {inspectDecodedSave} from './registry.mjs';
import {createSaveAchievementBridge} from './achievement-links.mjs';

export const SAVE_DUTY_MILESTONE_JOIN_CONTRACT='wand.db05.duty-milestone-numeric-witness@1';
const SCHEMA='wand.db05.native-duty-milestones@1';
const DUTY_SCHEMA='wand.db03.native-guide@1';
const SOURCE='ddv_Data/StreamingAssets/itemlist/DutyAch.json';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[1-9][0-9]*$/;
const MAX_ROWS=100000;
const MAX_RECORDS=256;
const MAX_MILESTONES=64;
const MAX_INT=2147483647;
const MIN_INT=-2147483648;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const int32=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=MIN_INT&&x<=MAX_INT;
function freezeDeep(x) {
  if(obj(x)||Array.isArray(x)){
    if(!Object.isFrozen(x)){for(const y of Object.values(x))freezeDeep(y);Object.freeze(x);}
  }
  return x;
}
freezeDeep(spec);
export function getSaveDutyMilestoneWireContract(){return spec;}
const sourceId=x=>typeof x==='string'&&ID.test(x)&&
  Number.isSafeInteger(Number(x))&&String(Number(x))===x;

function validatePrivateProjection(duties,milestones){
  // Existing DB-03 validation; IDs alone do not supply provenance.
  createSaveAchievementBridge(duties);
  if(!obj(milestones)||milestones.schema!==SCHEMA||
     milestones.sourceSchema!==DUTY_SCHEMA||
     !obj(milestones.target)||!obj(duties.target)||
     milestones.target.platform!==duties.target.platform||
     milestones.target.gameVersion!==duties.target.gameVersion||
     !obj(milestones.source)||milestones.source.file!==SOURCE||
     !HEX.test(milestones.source.sha256??'')||
     !obj(milestones.evidence)||
     milestones.evidence.nativeMessage!=='Definitions.Items.AchievementItemData'||
     milestones.evidence.milestonesFieldNumber!==13||
     milestones.evidence.nestedMessage!=='Definitions.Items.AchievementMilestone'||
     !obj(milestones.evidence.nestedFieldNumbers)||
     milestones.evidence.nestedFieldNumbers.milestone!==1||
     milestones.evidence.nestedFieldNumbers.rewardItem!==2||
     milestones.evidence.nestedFieldNumbers.rewardAmount!==3||
     milestones.evidence.typedFieldProofOnly!==true||
     milestones.evidence.allDefinitionsInterpreted!==false||
     milestones.evidence.rewardEligibilityVerified!==false||
     milestones.evidence.rewardOwnershipVerified!==false||
     milestones.evidence.saveProgressVerified!==false||
     milestones.evidence.writerAuthorized!==false||
     milestones.evidence.exportAuthorized!==false||
     !Array.isArray(milestones.records)||
     milestones.records.length!==duties.records.length||
     milestones.records.length>MAX_ROWS||
     !obj(milestones.summary))
    throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
  const sourceRows=new Map();
  const sourceFrames=new Set();
  for(const r of duties.records){
    if(!obj(r)||!sourceId(r.id)||!obj(r.source)||
       sourceRows.has(r.id)||sourceFrames.has(r.source.frameIndex)||
       r.source.sha256!==milestones.source.sha256)
      throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
    sourceRows.set(r.id,r);
    sourceFrames.add(r.source.frameIndex);
  }
  const records=new Map();
  let typed=0,opaque=0,missing=0,nMilestones=0;
  for(const r of milestones.records){
    if(!obj(r)||!sourceId(r.id)||records.has(r.id)||
       !sourceRows.has(r.id)||!Number.isSafeInteger(r.frameIndex)||
       r.frameIndex<0||r.frameIndex>=MAX_ROWS||
       !HEX.test(r.nativeWireSha256??'')||
       !Array.isArray(r.milestones)||r.milestones.length>MAX_MILESTONES||
       !['typed_milestone_fields','opaque_or_mixed_field13','no_field13_observed'].includes(r.evidenceState))
      throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
    const expected=sourceRows.get(r.id);
    if(r.nativeWireSha256!==expected.nativeWireSha256||
       r.frameIndex!==expected.source.frameIndex)
      throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
    let previous=0;
    for(const m of r.milestones){
      if(!obj(m)||!int32(m.milestone)||m.milestone<=previous||
         !int32(m.rewardItem)||m.rewardItem<0||
         !int32(m.rewardAmount)||m.rewardAmount<0)
        throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
      previous=m.milestone;
    }
    if(r.evidenceState==='typed_milestone_fields'){
      if(r.milestones.length===0)throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
      typed++;nMilestones+=r.milestones.length;
    }else{
      if(r.milestones.length!==0)throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
      if(r.evidenceState==='opaque_or_mixed_field13')opaque++;
      else missing++;
    }
    records.set(r.id,r);
  }
  const s=milestones.summary;
  if(s.nativeRows!==records.size||s.typedMilestoneDefinitions!==typed||
     s.opaqueOrMixedDefinitions!==opaque||s.noField13Definitions!==missing||
     s.typedMilestones!==nMilestones)
    throw new TypeError('DB05_DUTY_MILESTONE_PROJECTION_INVALID');
  // Keep private records in this closure; NEVER return raw source rows.
  return records;
}

/**
 * Original native source hashing happened offline in duty_milestones.py.
 * Browser structural checks alone cannot authenticate private original bytes.
 */
export function createSaveDutyMilestoneBridge(duties,projection){
  const records=validatePrivateProjection(duties,projection);
  return Object.freeze({
    contract:SAVE_DUTY_MILESTONE_JOIN_CONTRACT,
    auditSave(decoded,options={}){
      if(!obj(options))throw new TypeError('DB05_DUTY_MILESTONE_LIMIT_INVALID');
      const cap=options.maxReferences??MAX_RECORDS;
      if(!Number.isSafeInteger(cap)||cap<1||cap>MAX_RECORDS)
        throw new TypeError('DB05_DUTY_MILESTONE_LIMIT_INVALID');
      if(!inspectDecodedSave(decoded,null).rootShapeValid)
        throw new TypeError('DB05_DUTY_MILESTONE_ROOT_REQUIRED');
      const rows=decoded.Player.AchievementsData;
      const out={
        savedRowsWithDefinition:0,typedMilestoneDefinitionRows:0,
        opaqueDefinitionRows:0,noMilestoneFieldRows:0,
        typedMilestoneEntries:0,
        currentAmountComparisons:0,currentAtOrAboveThreshold:0,
        claimedMilestoneComparisons:0,claimedAtOrAboveThreshold:0,
        valueKindDifferences:0,invalidSaveRows:0,
        sampled:false
      };
      if(rows!==undefined&&!Array.isArray(rows))out.valueKindDifferences++;
      if(Array.isArray(rows)){
        out.sampled=rows.length>cap;
        for(const row of rows.slice(0,cap)){
          if(!obj(row)){out.invalidSaveRows++;continue;}
          const id=row.AchievementID;
          if(!int32(id)||id<=0)continue;
          const definition=records.get(String(id));
          if(!definition)continue;  // other/unknown IDs are not corruption
          out.savedRowsWithDefinition++;
          if(definition.evidenceState==='opaque_or_mixed_field13'){
            out.opaqueDefinitionRows++;continue;
          }
          if(definition.evidenceState==='no_field13_observed'){
            out.noMilestoneFieldRows++;continue;
          }
          out.typedMilestoneDefinitionRows++;
          out.typedMilestoneEntries+=definition.milestones.length;
          const hasCurrent=has(row,'CurAmount');
          const hasClaimed=has(row,'ClaimedRewardMilestone');
          const current=hasCurrent&&int32(row.CurAmount);
          const claimed=hasClaimed&&int32(row.ClaimedRewardMilestone);
          if(hasCurrent&&!current)out.valueKindDifferences++;
          if(hasClaimed&&!claimed)out.valueKindDifferences++;
          for(const m of definition.milestones){
            if(current){
              out.currentAmountComparisons++;
              if(row.CurAmount>=m.milestone)out.currentAtOrAboveThreshold++;
            }
            if(claimed){
              out.claimedMilestoneComparisons++;
              if(row.ClaimedRewardMilestone>=m.milestone)out.claimedAtOrAboveThreshold++;
            }
          }
        }
      }
      const status=out.invalidSaveRows||out.valueKindDifferences
        ?'observed_value_kind_difference':
        out.sampled?'sampled_inconclusive':
        !out.savedRowsWithDefinition?'not_observed':
        out.opaqueDefinitionRows||out.noMilestoneFieldRows?'partially_typed_source_definitions':
        'typed_numeric_threshold_witness';
      return Object.freeze({
        contract:SAVE_DUTY_MILESTONE_JOIN_CONTRACT,
        status,...out,
        sourceDefinitionType:'AchievementItemData.Milestones/AchievementMilestone',
        thresholdComparisonsAreNumericOnly:true,
        completeSourceDefinitionsVerified:false,
        sourceOriginalBytesHashedByThisBridge:false,
        privateIndexSourceMetadataValidated:true,
        gameBuildSaveJointlyVerified:false,
        completionVerified:false,
        rewardClaimableVerified:false,
        rewardGrantedVerified:false,
        rewardOwnershipVerified:false,
        missingRecordsAreNotCorruption:true,
        ownerModifiedSaveMayOmitObjects:true,
        writerAuthorized:false,
        exportAuthorized:false
      });
    }
  });
}
