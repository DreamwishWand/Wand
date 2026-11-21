#!/usr/bin/env python3
"""Offline private ZIP smoke for exact DB-02 r5 + Steam 1.26.2 static prices.

Prints aggregate evidence only. Never emits or publishes original item IDs,
shop keys, price amounts, game data, or player saves.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import zipfile

R5_ZIP='7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8'
R5_MANIFEST='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c'
PRICE_ZIP='347ac135fdc07f57c82f556506fcaf3eb21710062a9c6c5d1b32654fde3b1853'
PRICE_MANIFEST='641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975'
CONDITION_SHA='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
R5_FILES={'recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl',
          'stall-sources.jsonl','related-items.jsonl','ingredient-selector-membership.jsonl',
          'condition-gates.jsonl','condition-definitions.jsonl','report.json','unresolved.json'}
PRICE_FILES={'dynamic-price-source.jsonl','shop-definitions.jsonl',
             'stall-shop-joins.jsonl','static-item-prices.jsonl'}


def require(value,code):
    if not value:
        raise ValueError('DB02_STATIC_PRICE_AUDIT_'+code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_release(path,zip_digest,manifest_digest,members):
    path=Path(path)
    require(path.is_file() and not path.is_symlink() and
            0 < path.stat().st_size < 2*1024*1024,'SOURCE_FILE')
    require(sha(path.read_bytes())==zip_digest,'ZIP_SHA')
    with zipfile.ZipFile(path) as archive:
        infos=archive.infolist()
        names=[x.filename for x in infos]
        require(len(names)==len(set(names))==len(members)+1 and
                set(names)==members|{'manifest.json'},'ZIP_MEMBERS')
        require(all(not x.filename.startswith('/') and '..' not in x.filename.split('/') and
                    not x.flag_bits&1 and x.file_size<=8*1024*1024 and
                    (x.external_attr>>16)&0o170000!=0o120000 for x in infos),'ZIP_UNSAFE_ENTRY')
        manifest_bytes=archive.read('manifest.json')
        require(sha(manifest_bytes)==manifest_digest,'MANIFEST_SHA')
        manifest=json.loads(manifest_bytes)
        require(set(manifest.get('files',{}))==members,'LEDGER_MEMBERS')
        data={}
        for name in sorted(members):
            raw=archive.read(name)
            require(sha(raw)==manifest['files'][name],'FILE_SHA_'+name)
            data[name]=[json.loads(row) for row in raw.splitlines() if row.strip()] if name.endswith('.jsonl') else json.loads(raw)
        return manifest,data


def analyze(stalls,loot,prices,shops,links):
    require((len(stalls),len(prices),len(shops),len(links))==(65,988,44,65),'SOURCE_COUNTS')
    by_stall={s['stallId']:s for s in stalls}
    by_loot={s['lootTableId']:s for s in loot}
    by_price={s['itemId']:s for s in prices}
    by_shop={s['shopKey']:s for s in shops}
    by_link={s['stallId']:s for s in links}
    require(all(len(mapping)==count for mapping,count in [
        (by_stall,len(stalls)),(by_loot,len(loot)),(by_price,len(prices)),
        (by_shop,len(shops)),(by_link,len(links))]),'DUPLICATE_KEYS')
    result=Counter()
    all_ids=set()
    all_currencies=set()
    for stall_id,stall in by_stall.items():
        link=by_link.get(stall_id)
        require(link is not None and link['shopKey']==stall['shopDataKey'] and
                link['offerItemMappingVerified'] is False,'STALL_KEY')
        shop=by_shop.get(link['shopKey'])
        require(shop is not None and
                len(shop['slots'])==len(stall['slotLootTableIds'])==link['nativeShopSlotCount'] and
                link['nativeSlotCountMatchesStallLoot'] is True,'SHOP_SLOT_COUNT')
        currencies={s['currencyId'] for s in shop['slots']}
        require(all(isinstance(x,int) and x>0 for x in currencies),'CURRENCY_ID')
        all_currencies.update(currencies)
        items=set()
        for table_id in stall['slotLootTableIds']:
            table=by_loot.get(table_id)
            require(table is not None,'LOOT_TABLE')
            for group in table['groups']:
                for candidate in group['candidates']:
                    item_id=candidate['itemId']
                    require(type(item_id) is int and item_id>0,'ITEM_ID')
                    items.add(item_id)
        all_ids.update(items)
        priced=items.intersection(by_price)
        result['candidateOccurrences']+=len(items)
        result['pricedCandidateOccurrences']+=len(priced)
        result['unpricedCandidateOccurrences']+=len(items)-len(priced)
        dbs={by_price[item_id]['databaseKey'] for item_id in priced}
        result['databaseCount_'+str(len(dbs))]+=1
        if not priced: result['noPricedStalls']+=1
        elif len(priced)==len(items):result['fullyPricedStalls']+=1
        else:result['partiallyPricedStalls']+=1
        for item_id in priced:
            costs=by_price[item_id]['purchaseCostDefinitions']
            matching=[cost for cost in costs if cost['currencyId'] in currencies]
            require(len(matching)==1,'AMBIGUOUS_SOURCE_CURRENCY')
            result['matchingPurchaseCostOccurrences']+=len(matching)
            result['otherPurchaseCostOccurrences']+=len(costs)-len(matching)
    counts={
      'stalls':len(stalls),
      'fullyPricedStalls':result['fullyPricedStalls'],
      'noPricedStalls':result['noPricedStalls'],
      'partiallyPricedStalls':result['partiallyPricedStalls'],
      'singleDatabaseStalls':result['databaseCount_1'],
      'twoDatabaseStalls':result['databaseCount_2'],
      'threeDatabaseStalls':result['databaseCount_3'],
      'zeroDatabaseStalls':result['databaseCount_0'],
      'candidateOccurrences':result['candidateOccurrences'],
      'pricedCandidateOccurrences':result['pricedCandidateOccurrences'],
      'unpricedCandidateOccurrences':result['unpricedCandidateOccurrences'],
      'distinctCandidateItems':len(all_ids),
      'matchingPurchaseCostOccurrences':result['matchingPurchaseCostOccurrences'],
      'otherPurchaseCostOccurrences':result['otherPurchaseCostOccurrences'],
      'distinctShopCurrencies':len(all_currencies),
    }
    expected={'stalls':65,'fullyPricedStalls':50,'noPricedStalls':15,
      'partiallyPricedStalls':0,'singleDatabaseStalls':29,'twoDatabaseStalls':18,
      'threeDatabaseStalls':3,'zeroDatabaseStalls':15,
      'candidateOccurrences':745,'pricedCandidateOccurrences':683,
      'unpricedCandidateOccurrences':62,'distinctCandidateItems':606,
      'matchingPurchaseCostOccurrences':683,'otherPurchaseCostOccurrences':162,
      'distinctShopCurrencies':1}
    require(counts==expected and all_currencies=={80000000},'PINNED_SOURCE_CENSUS_CHANGED')
    return {'schema':'wand.db02.private-static-price-audit@1',
      'platform':'Steam','gameVersion':'1.26.2',
      'r5ManifestSha256':R5_MANIFEST,'priceManifestSha256':PRICE_MANIFEST,
      'privateSource':True,'publishable':False,'counts':counts,
      'allShopSourceCurrencyIds':[80000000],
      'currentOffersVerified':False,'shopPriceDatabaseSelectionVerified':False,
      'effectivePriceVerified':False,'liveStockVerified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--r5-zip',required=True)
    parser.add_argument('--price-zip',required=True)
    args=parser.parse_args()
    r5,rs=read_release(args.r5_zip,R5_ZIP,R5_MANIFEST,R5_FILES)
    prices,ps=read_release(args.price_zip,PRICE_ZIP,PRICE_MANIFEST,PRICE_FILES)
    require(r5.get('schema')=='wand.src02@1' and r5.get('platform')=='Steam' and
            r5.get('gameVersion')=='1.26.2' and
            r5['source'].get('conditionSha256')==CONDITION_SHA and
            r5['counts'].get('stallsWithStaticLoot')==65 and
            r5['counts'].get('shopOffersVerified')==0,'WRONG_R5_SOURCE')
    require(prices.get('schema')=='wand.db02.protodb-shops@1' and
            prices.get('platform')=='Steam' and prices.get('gameVersion')=='1.26.2' and
            prices.get('privateOnly') is True and
            prices.get('publicationAuthorized') is False and
            prices.get('src02R5ManifestSha256')==R5_MANIFEST and
            prices['source'].get('sha256')==PROTO_SHA and
            prices['counts'].get('verifiedCurrentShopOffers')==0,'WRONG_PRICE_SOURCE')
    print(json.dumps(analyze(rs['stall-sources.jsonl'],rs['loot-tables.jsonl'],
      ps['static-item-prices.jsonl'],ps['shop-definitions.jsonl'],
      ps['stall-shop-joins.jsonl']),sort_keys=True,indent=2))


if __name__=='__main__':
    main()
