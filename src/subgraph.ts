import { log, ByteArray, BigInt, Address, crypto, store } from "@graphprotocol/graph-ts"
import { ADDRESS_ZERO, ONE_BI, ZERO_BI } from "./constants";

import { 
    AddressResolver as Resolver,
    Exchange,
    ContentFactory,
    ContentStatisticsManager,
    Content,
    Account,
    Order,
    OrderClaimTransaction,
    OrderFill,
    Asset,
    AssetBalance
} from "../generated/schema";

import {
    AddressResolver as AddressResolverContract,
    AddressRegistered as AddressRegisteredEvent
} from "../generated/AddressResolver/AddressResolver";

import {
    Exchange as ExchangeContract,
    OrderPlaced as OrderPlacedEvent,
    OrdersFilled as OrdersFilledEvent,
    OrdersDeleted as OrdersDeletedEvent,
    OrdersClaimed as OrdersClaimedEvent
} from "../generated/templates/Exchange/Exchange";

import {
  ContentFactory as ContentFactoryContract,
  ContractsDeployed as ContractsDeployedEvent
} from "../generated/templates/ContentFactory/ContentFactory";

import {
    Content as ContentContract,
    TransferBatch as TransferBatchEvent,
    TransferSingle as TransferSingleEvent,
} from "../generated/templates/Content/Content";

import {
    Exchange as ExchangeTemplate,
    ContentFactory as ContentFactoryTemplate,
    Content as ContentTemplate,
} from '../generated/templates';

export function handleAddressRegistered(event: AddressRegisteredEvent): void {
    let resolver = Resolver.load(event.address.toHexString());
    if (resolver == null) {
      resolver = createAddressResolver(event.address);
    }
    
    if (event.params.id.toHexString() == "0xeef64103") {
        // Exchange Hash = 0xeef64103
        // Start Listening for Exchange Events and create Exchange entity
        ExchangeTemplate.create(event.params.contractAddress);
        let exchange = Exchange.load(event.params.contractAddress.toHexString());
        if (exchange == null) {
            exchange = createExchange(event.params.contractAddress);
            resolver.exchange = exchange.id;
            resolver.save();
        }
    } else if (event.params.id.toHexString() == "0xdb337f7d") {
        // ContentFactory Hash = 0xdb337f7d
        // Start Listening for Content Factory events and create Content Factory Entity
        ContentFactoryTemplate.create(event.params.contractAddress);
        let contentFactory = ContentFactory.load(event.params.contractAddress.toHexString());
        if (contentFactory == null) {
            contentFactory = new ContentFactory(event.params.contractAddress.toHexString());
            contentFactory.save();
        }

        // Create content stats manager
        let contentStatsMan = ContentStatisticsManager.load(contentFactory.id);
        if (contentStatsMan == null) {
            contentStatsMan = new ContentStatisticsManager(contentFactory.id);
            contentStatsMan.contentsCount = ZERO_BI;
            contentStatsMan.assetsCount = ZERO_BI;
            contentStatsMan.accountsCount = ZERO_BI;
            contentStatsMan.save();
        }
    } else {
        log.info('-------- LOG: Resolver - Ignoring registered address: {}', [event.params.id.toHexString()]);
    }
}
export function handleContractsDeployed(event: ContractsDeployedEvent): void {
    let factory = ContentFactory.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(event.address.toHexString())!;
    contentStatsMan.contentsCount = contentStatsMan.contentsCount.plus(ONE_BI);
    contentStatsMan.save();

    let content = Content.load(event.params.content.toHexString());
    // Create content object
    if (content == null) {
        ContentTemplate.create(event.params.content);
        let content = new Content(event.params.content.toHexString());
        content.factory = factory.id;
        content.assetsCount = ZERO_BI;
        content.save();
    }
}

export function handleTransferBatch(event: TransferBatchEvent): void {
    //TransferBatch(address operator, address from, address to, uint256[] ids, u as TransferSingleEventint256[] values)
    // transfer multiple assets
    let content = Content.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(content.factory)!;

    let ids = event.params.ids;
    let amounts = event.params.values;
    for (let i = 0; i < ids.length; ++i) {
        // get asset
        let assetId = getAssetId(content.id, ids[i].toString());
        
        // create asset if it doesn't exist yet
        let asset = Asset.load(assetId);
        if (asset == null) {
            asset = createAsset(assetId, content.id, ids[i]);
            
            // Increment asset counter in stats
            contentStatsMan.assetsCount = contentStatsMan.assetsCount.plus(ONE_BI);
            contentStatsMan.save();
        }
        
        if (event.params.to.toHex() != ADDRESS_ZERO) {
            // receiver exists
            let receiver = Account.load(event.params.to.toHexString());
            if (receiver == null) {
                // Add new user account
                receiver = createAccount(event.params.to);
                
                // Increment accounts counter in stats
                contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
                contentStatsMan.save();
            }

            // get/create account balance
            let assetBalanceId = getAssetBalanceId(content.id, receiver.id, ids[i].toString());
            let balance = AssetBalance.load(assetBalanceId);
            if (balance == null) {
                balance = createAssetBalance(assetBalanceId, assetId, receiver.id);
            }

            // if balance is new or was at zero again previously, increment unique asset count
            if (balance.amount == ZERO_BI) {
                receiver.uniqueAssetsCount = receiver.uniqueAssetsCount.plus(ONE_BI);
                receiver.save();
            }

            balance.amount = balance.amount.plus(amounts[i]);
            balance.save();
        }

        if (event.params.from.toHex() != ADDRESS_ZERO) {
            // sender exists
            let sender = Account.load(event.params.from.toHexString())!;
            
            // get/create account balance
            let assetBalanceId = getAssetBalanceId(content.id, sender.id, ids[i].toString());
            let balance = AssetBalance.load(assetBalanceId)!;
            
            balance.amount = balance.amount.minus(amounts[i]);
            balance.save();

            // if balance drops to 0, decrement unique asset count
            if (balance.amount == ZERO_BI) {
                sender.uniqueAssetsCount = sender.uniqueAssetsCount.minus(ONE_BI);
                sender.save();
            }
        }
    }
}

export function handleTransferSingle(event: TransferSingleEvent): void {
    let content = Content.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(content.factory)!;
  
    // get asset
    let assetId = getAssetId(content.id, event.params.id.toString());

    // create asset if it doesn't exist yet
    let asset = Asset.load(assetId);
    if (asset == null) {
        asset = createAsset(assetId, content.id, event.params.id);
        
        // Increment asset counter in stats
        contentStatsMan.assetsCount = contentStatsMan.assetsCount.plus(ONE_BI);
        contentStatsMan.save();
    }

    let amount = event.params.value;
    if (event.params.to.toHex() != ADDRESS_ZERO) {
        // receiver exists
        let receiver = Account.load(event.params.to.toHexString());
        if (receiver == null) {
            // Add new owner
            receiver = createAccount(event.params.to);
            
            // Increment accounts counter in stats
            contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
            contentStatsMan.save();
        }
    
        // get/create account balance
        let assetBalanceId = getAssetBalanceId(content.id, receiver.id, event.params.id.toString());
        let balance = AssetBalance.load(assetBalanceId);
        if (balance == null) {
            balance = createAssetBalance(assetBalanceId, assetId, receiver.id);
        }
    
        // if balance is new or was at zero again previously, increment unique asset count
        if (balance.amount == ZERO_BI) {
            receiver.uniqueAssetsCount = receiver.uniqueAssetsCount.plus(ONE_BI);
            receiver.save();
        }
    
        balance.amount = balance.amount.plus(amount);
        balance.save();
    } 
  
    if (event.params.from.toHex() != ADDRESS_ZERO) {
        // sender exists
        let sender = Account.load(event.params.from.toHexString())!;
    
        // get/create account balance
        let assetBalanceId = getAssetBalanceId(content.id, sender.id, event.params.id.toString());
        let balance = AssetBalance.load(assetBalanceId)!;
        
        balance.amount = balance.amount.minus(amount);
        balance.save();
    
        // if balance drops to 0, decrement unique asset count
        if (balance.amount == ZERO_BI) {
            sender.uniqueAssetsCount = sender.uniqueAssetsCount.minus(ONE_BI);
            sender.save();
        }
    }
}

export function handleOrderPlaced(event: OrderPlacedEvent): void {
    // Todo:
}

export function handleOrdersFilled(event: OrdersFilledEvent): void {
    // Todo:
}

export function handleOrdersDeleted(event: OrdersDeletedEvent): void {
    // Todo:
}

export function handleOrdersClaimed(event: OrdersClaimedEvent): void {
    // Todo:
}

function createAddressResolver(id: Address): Resolver {
    let resolver = new Resolver(id.toHexString());
    resolver.save();
    return resolver;
}

function createAccount(address: Address): Account {
    let account = new Account(address.toHexString());
    account.ordersCount = ZERO_BI;
    account.orderFillsCount = ZERO_BI;
    account.cancelledOrdersCount = ZERO_BI;
    account.claimedOrdersCount = ZERO_BI;
    account.volume = ZERO_BI;
    account.volumeAsBuyer = ZERO_BI;
    account.volumeAsSeller = ZERO_BI;
    account.daysActive = ZERO_BI;
    account.uniqueAssetsCount = ZERO_BI;
    account.save();
    return account;
}
  
export function createAsset(id: string, parent: string, tokenId: BigInt): Asset {
    let asset = new Asset(id);
    asset.tokenId = tokenId;
    asset.parentContract = parent;
    asset.save();

    // Update Content asset count
    let content = Content.load(parent)!;
    content.assetsCount = content.assetsCount.plus(ONE_BI);
    content.save();

    return asset;
}
  
function createAssetBalance(id: string, assetId: string, owner: string): AssetBalance {
    let asset = Asset.load(assetId)!;
    let balance = new AssetBalance(id);
    balance.asset = assetId;
    balance.owner = owner;
    balance.amount = ZERO_BI;
    balance.save();
    return balance;
}

function getAssetId(content: string, tokenId: string): string {
    return concat(content, tokenId);
}

function getAssetBalanceId(content: string, account: string, tokenId: string): string {
    return concat2(content, account, tokenId); 
}

function concat(str1: string, str2: string): string {
    return str1 + '-' + str2;
}

function concat2(str1: string, str2: string, str3: string): string {
    return str1 + '-' + str2 + '-' + str3;
}


function createExchange(address: Address): Exchange {
    let exchange = new Exchange(address.toHexString());
    exchange.OrdersCount = ZERO_BI;
    exchange.OrderFillsCount = ZERO_BI;
    exchange.save();
    return exchange;
}