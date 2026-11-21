"""Source-evidenced Steam v1.26.1 IL2CPP Mission protobuf field contracts.

Field numbers are from Definitions.Items.MissionObjectiveData and
Definitions.Conditions.ConditionOneOf, not guessed by name matching.
The user's source archive version must still be verified per extraction.
"""
OBJECTIVE_KINDS = {60: 'AncientMachineOperation', 70: 'BeeHouseCondition', 75: 'BestFriendRequestItem', 80: 'BringItem', 90: 'BoatCrewMember', 92: 'BoatCustomization', 102: 'BoutiqueChallenge', 103: 'BoutiqueDisplay', 105: 'CatchFish', 106: 'CatchSnippet', 108: 'Chase', 110: 'CollectCurrency', 112: 'CompleteStory', 115: 'Conditional', 120: 'ConsumeItem', 125: 'CookMeal', 130: 'CraftItem', 135: 'Decorate', 136: 'DecorationPresetOperation', 140: 'DesignChallenge', 145: 'DressUp', 150: 'EatMeal', 155: 'ExpandHouse', 160: 'FeedCritter', 165: 'FillKeyhole', 170: 'FinishHouse', 175: 'FollowCharacter', 180: 'Friend', 185: 'GardeningHarvest', 190: 'GardeningPlant', 195: 'GiftToCharacter', 196: 'Hangout', 197: 'Interaction', 198: 'InteractWithStall', 200: 'Listen', 205: 'MakeGarden', 206: 'MermaidTrawlDistance', 207: 'MenuAction', 210: 'MineMineral', 211: 'MountCare', 212: 'MountFeed', 213: 'MountGearUp', 214: 'MountJump', 215: 'MountRide', 216: 'MoveFloatingObjectVertically', 217: 'Party', 220: 'PickUp', 225: 'PlaceBuilding', 227: 'PlayBoardGame', 228: 'PlayBridgeGame', 229: 'PlayBridgeGamePreset', 230: 'PlayMinigame', 231: 'Possess', 235: 'PurchaseItem', 240: 'RemoveBlocker', 245: 'RoyalDuties', 246: 'SailingAction', 247: 'SceneryPuzzle', 250: 'SellItem', 255: 'ServeRestaurantOrder', 258: 'SpendMana', 260: 'StartDiscussion', 265: 'TakePicture', 270: 'TalkToCharacter', 272: 'TimeBending', 275: 'Unlock', 280: 'UnlockCharacter', 285: 'Upgrade', 290: 'VisitArea', 295: 'WaterPlant', 296: 'StarPathFtueDuty', 297: 'StarPathFtueReward'}
CONDITION_KINDS = {5:'CommonConditions', 10:'SubConditions', 20:'AlwaysTrue', 25:'AlwaysFalse',
 30:'AreaUnlocked', 50:'CharacterFriendship', 65:'CharacterUnlocked',
 140:'Expansion', 250:'MissionAvailable', 255:'MissionCompleted',
 260:'MissionOngoing', 270:'MissionStatus', 275:'MissionTypeStatus',
 280:'MissionStepCompleted', 285:'MissionStepStatus',
 290:'MissionObjectiveCompleted', 295:'MissionObjectiveStatus',
 297:'MissionObjectiveSkipped', 300:'MissionObjectiveProgression',
 450:'StoryCompleted'}
BOOL_OPERATORS = {0:'AND', 1:'OR', 2:'NOT'}
MISSION_STATUS_OPERATORS = {0:'NotStarted', 1:'StartedOrCompleted', 2:'OnGoing',
 3:'NotOnGoing', 4:'Completed', 5:'NotCompleted', 6:'ReadyToBeCompleted',
 7:'NotReadyToBeCompleted'}
UI_CATEGORIES = {0:'Default',1:'Realm',2:'Story',4:'Friendship',5:'RepeatableDaily',
 6:'RepeatableWeekly',7:'DreamBundle',8:'Hidden',9:'HiddenUntilStarted'}
MISSION_TYPE_FIELDS = {9:'type', 8:'status', 10:'repeatability', 14:'visibility',
 15:'uiCategory'}

MISSION_TYPES = {0:'Story', 1:'Village', 2:'TLE', 3:'Secret', 4:'Realm', 5:'Repeatable', 6:'DreamBundle'}
