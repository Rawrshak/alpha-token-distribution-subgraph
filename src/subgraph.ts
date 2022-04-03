import { log, ByteArray, BigInt, Address, crypto, store } from "@graphprotocol/graph-ts"
import { SNAPSHOT_TIMESTAMP, ADDRESS_ZERO, ADDRESS_DEV, ONE_BI, ZERO_BI, SECONDS_PER_DAY } from "./constants";

import { 
    AddressResolver as Resolver,
    Exchange,
    ContentFactory,
    ContentStatisticsManager,
    Content,
    Account,
    Order,
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
    ContentManager as ContentManagerContract
  } from "../generated/templates/ContentFactory/ContentManager";

import {
    ContentStorage as ContentStorageContract,
    AssetsAdded as AssetsAddedEvent,
} from "../generated/templates/ContentStorage/ContentStorage";

import {
    Exchange as ExchangeTemplate,
    ContentFactory as ContentFactoryTemplate,
    Content as ContentTemplate,
    ContentStorage as ContentStorageTemplate,
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
            contentStatsMan.uniqueAssetsCount = ZERO_BI;
            contentStatsMan.save();
        }
    } else {
        log.info('-------- LOG: Resolver - Ignoring registered address: {}', [event.params.id.toHexString()]);
    }
}
export function handleContractsDeployed(event: ContractsDeployedEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }

    let factory = ContentFactory.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(event.address.toHexString())!;
    if (event.transaction.from.toHexString() != ADDRESS_DEV) {
        contentStatsMan.contentsCount = contentStatsMan.contentsCount.plus(ONE_BI);
    }
    contentStatsMan.save();

    let creator = Account.load(event.transaction.from.toHexString().toLowerCase());
    if (creator == null) {
        // Add new user account
        creator = createAccount(event.transaction.from, event.block.timestamp);
    }
    // Increment account's contracts deployed count
    creator.contractsDeployedCount = creator.contractsDeployedCount.plus(ONE_BI);
    creator.save();

    let content = Content.load(event.params.content.toHexString());
    // Create content object
    if (content == null) {
        ContentTemplate.create(event.params.content);
        let content = new Content(event.params.content.toHexString());
        content.factory = factory.id;
        content.assetsCount = ZERO_BI;
        content.save();
    }

    // Listen for ContentStorage Events
    let contentManagerContract = ContentManagerContract.bind(event.params.contentManager);
    ContentStorageTemplate.create(contentManagerContract.contentStorage());
}

// ContentStorage Events
export function handleAssetsAdded(event: AssetsAddedEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }

    // make sure parent content contract has been loaded
    let parent = Content.load(event.params.parent.toHexString())!;
    let tokenIds = event.params.tokenIds;

    // For every asset added, create a new asset object
    for (let i = 0; i < tokenIds.length; ++i) {
        let assetId = getAssetId(parent.id, tokenIds[i].toString());
        let asset = new Asset(assetId);
        asset.tokenId = tokenIds[i];
        asset.parentContract = parent.id;
        asset.save();
    }
    
    // Update Content asset count
    parent.assetsCount = parent.assetsCount.plus(BigInt.fromI32(tokenIds.length));
    parent.save();

    let creator = Account.load(event.transaction.from.toHexString().toLowerCase())!;
    // Increment account's contracts deployed count
    creator.assetsDeployedCount = creator.assetsDeployedCount.plus(BigInt.fromI32(tokenIds.length));
    creator.save();

    // add the number of assets
    let contentStatsMan = ContentStatisticsManager.load(parent.factory)!;
    if (event.transaction.from.toHexString() != ADDRESS_DEV) {
        contentStatsMan.assetsCount = contentStatsMan.assetsCount.plus(BigInt.fromI32(tokenIds.length));
    }
    contentStatsMan.save();
}

export function handleTransferBatch(event: TransferBatchEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }

    //TransferBatch(address operator, address from, address to, uint256[] ids, u as TransferSingleEventint256[] values)
    // transfer multiple assets
    let content = Content.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(content.factory)!;

    let ids = event.params.ids;
    let amounts = event.params.values;
    for (let i = 0; i < ids.length; ++i) {
        // get asset
        let assetId = getAssetId(content.id, ids[i].toString());
        
        if (event.params.to.toHex() != ADDRESS_ZERO) {
            // receiver exists
            let receiver = Account.load(event.params.to.toHexString().toLowerCase());
            if (receiver == null) {
                // Add new user account
                receiver = createAccount(event.params.to, event.block.timestamp);
                
                // Increment accounts counter in stats
                if (receiver.id != ADDRESS_DEV) {
                    contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
                    contentStatsMan.save();
                }
            }

            // get/create account balance
            let assetBalanceId = getAssetBalanceId(content.id, receiver.id, ids[i].toString());
            let balance = AssetBalance.load(assetBalanceId);
            if (balance == null) {
                balance = createAssetBalance(assetBalanceId, assetId, receiver.id);
                
                if (receiver.id != ADDRESS_DEV) {
                    contentStatsMan.uniqueAssetsCount = contentStatsMan.uniqueAssetsCount.plus(ONE_BI);
                    contentStatsMan.save();
                }

                // increment for new balance instance for unique asset
                receiver.uniqueAssetsCount = receiver.uniqueAssetsCount.plus(ONE_BI);
                receiver.save();
            }

            balance.amount = balance.amount.plus(amounts[i]);
            balance.save();
        }

        if (event.params.from.toHex() != ADDRESS_ZERO) {
            // sender exists
            let sender = Account.load(event.params.from.toHexString().toLowerCase())!;
            
            // get/create account balance
            let assetBalanceId = getAssetBalanceId(content.id, sender.id, ids[i].toString());
            let balance = AssetBalance.load(assetBalanceId)!;
            
            balance.amount = balance.amount.minus(amounts[i]);
            balance.save();
        }
    }
}

export function handleTransferSingle(event: TransferSingleEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }
    
    let content = Content.load(event.address.toHexString())!;
    let contentStatsMan = ContentStatisticsManager.load(content.factory)!;
  
    // get asset
    let assetId = getAssetId(content.id, event.params.id.toString());

    let amount = event.params.value;
    if (event.params.to.toHex() != ADDRESS_ZERO) {
        // receiver exists
        let receiver = Account.load(event.params.to.toHexString().toLowerCase());
        if (receiver == null) {
            // Add new owner
            receiver = createAccount(event.params.to, event.block.timestamp);
            
            // Increment accounts counter in stats
            if (receiver.id != ADDRESS_DEV) {
                contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
                contentStatsMan.save();
            }
        }
    
        // get/create account balance
        let assetBalanceId = getAssetBalanceId(content.id, receiver.id, event.params.id.toString());
        let balance = AssetBalance.load(assetBalanceId);
        if (balance == null) {
            balance = createAssetBalance(assetBalanceId, assetId, receiver.id);
            
            if (receiver.id != ADDRESS_DEV) {
                contentStatsMan.uniqueAssetsCount = contentStatsMan.uniqueAssetsCount.plus(ONE_BI);
                contentStatsMan.save();
            }
            
            // increment for new balance instance for unique asset
            receiver.uniqueAssetsCount = receiver.uniqueAssetsCount.plus(ONE_BI);
            receiver.save();
        }
    
        balance.amount = balance.amount.plus(amount);
        balance.save();
    } 
  
    if (event.params.from.toHex() != ADDRESS_ZERO) {
        // sender exists
        let sender = Account.load(event.params.from.toHexString().toLowerCase())!;
    
        // get/create account balance
        let assetBalanceId = getAssetBalanceId(content.id, sender.id, event.params.id.toString());
        let balance = AssetBalance.load(assetBalanceId)!;
        
        balance.amount = balance.amount.minus(amount);
        balance.save();
    }
}

export function handleOrderPlaced(event: OrderPlacedEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }

    let assetId = getAssetId(event.params.order.asset.contentAddress.toHexString(), event.params.order.asset.tokenId.toString());

    // get the stats manager
    let content = Content.load(event.params.order.asset.contentAddress.toHexString())!;
    let factory = ContentFactory.load(content.factory)!;
    let contentStatsMan = ContentStatisticsManager.load(factory.id)!;

    // Create asset object if it doesn't already exist
    let asset = Asset.load(assetId)!;

    // Create Owner account object if it doesn't already exist
    let ownerAcc = Account.load(event.params.order.owner.toHexString().toLowerCase());
    if (ownerAcc == null) {
        ownerAcc = createAccount(event.params.order.owner, event.block.timestamp);
        
        // Increment accounts counter in stats
        if (ownerAcc.id != ADDRESS_DEV) {
            contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
            contentStatsMan.save();
        }
    }
    ownerAcc.ordersCount = ownerAcc.ordersCount.plus(ONE_BI);
    
    let exchange = Exchange.load(event.address.toHexString())!;

    // Create Order
    let order = createOrder(event.params.orderId, assetId, ownerAcc.id, exchange.id);
    order.type = (event.params.order.isBuyOrder) ? "Buy" : "Sell";
    order.price = event.params.order.price;
    order.amountOrdered = event.params.order.amount;
    order.save();

    // Update exchange data
    if (ownerAcc.id != ADDRESS_DEV) {
        exchange.ordersCount = exchange.ordersCount.plus(ONE_BI);
    }

    // Add new user active day
    if (isNewDay(ownerAcc.lastActiveDate, event.block.timestamp)) {
        ownerAcc.daysActive = ownerAcc.daysActive.plus(ONE_BI);
        ownerAcc.lastActiveDate = event.block.timestamp;
        
        if (ownerAcc.id != ADDRESS_DEV) {
            exchange.totalUserActiveDays = exchange.totalUserActiveDays.plus(ONE_BI);
        }
    }
    
    ownerAcc.save();
    exchange.save();
}

export function handleOrdersFilled(event: OrdersFilledEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }

    // get the stats manager
    let content = Content.load(event.params.asset.contentAddress.toHexString())!;
    let factory = ContentFactory.load(content.factory)!;
    let contentStatsMan = ContentStatisticsManager.load(factory.id)!;

    let taker = Account.load(event.params.from.toHexString().toLowerCase());
    if (taker == null) {
        taker = createAccount(event.params.from, event.block.timestamp);
        
        // Increment accounts counter in stats
        if (taker.id != ADDRESS_DEV) {
            contentStatsMan.accountsCount = contentStatsMan.accountsCount.plus(ONE_BI);
            contentStatsMan.save();
        }
    }

    // Check asset - must already exist
    let assetId = getAssetId(event.params.asset.contentAddress.toHexString(), event.params.asset.tokenId.toString());
    let asset = Asset.load(assetId)!;

    // These should be the same lengths, checked by the smart contract
    let orderIds = event.params.orderIds;
    let orderAmounts = event.params.amounts;
    let isBuyOrder = false;
    
    let exchange = Exchange.load(event.address.toHexString())!;

    for (let j = 0; j < orderIds.length; ++j) {
        if (orderAmounts[j].equals(ZERO_BI)) {
            continue;
        }

        let orderId = orderIds[j];

        // Update user data
        taker.orderFillsCount = taker.orderFillsCount.plus(ONE_BI);

        // Update order status
        let order = Order.load(orderId.toHexString())!;
        isBuyOrder = order.type == "Buy" ? true : false;
        
        // Add user volume to the maker and the taker
        let volume = orderAmounts[j].times(order.price);
        taker.takerVolume = taker.takerVolume.plus(volume);
        taker.save();
        let maker = Account.load(order.owner)!;
        maker.makerVolume = maker.makerVolume.plus(volume)
        maker.save();

        // Update exchange data
        if (taker.id != ADDRESS_DEV) {
            exchange.orderFillsCount = exchange.orderFillsCount.plus(ONE_BI);
            exchange.takerVolume = exchange.takerVolume.plus(volume);
            exchange.save();
        }
        if (maker.id != ADDRESS_DEV) {
            exchange.makerVolume = exchange.makerVolume.plus(volume);
            exchange.save();
        }

        // Update order data
        order.amountFilled = order.amountFilled.plus(orderAmounts[j]);
        let amountLeft = order.amountOrdered.minus(order.amountFilled);
        if (amountLeft == ZERO_BI) {
            order.status = "Filled";
        } else {
            order.status = "PartiallyFilled";
        }
        order.save();
    }
    
    // Add new user active day
    if (isNewDay(taker.lastActiveDate, event.block.timestamp)) {
        taker.daysActive = taker.daysActive.plus(ONE_BI);
        taker.lastActiveDate = event.block.timestamp;
        
        if (taker.id != ADDRESS_DEV) {
            exchange.totalUserActiveDays = exchange.totalUserActiveDays.plus(ONE_BI);
        }
    }

    taker.save();
    exchange.save();
}

export function handleOrdersDeleted(event: OrdersDeletedEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }
    
    let orderIds = event.params.orderIds;
    let exchange = Exchange.load(event.address.toHexString())!;
    let owner = Account.load(event.params.owner.toHexString().toLowerCase())!;

    for (let j = 0; j < orderIds.length; ++j) {
        let orderId = orderIds[j];

        // Update order status
        let order = Order.load(orderId.toHexString())!;
        order.status = "Cancelled";

        // if there is an unclaimed amount still, we add a claim order stat
        if (order.amountClaimed != order.amountFilled) {
            owner.claimedOrdersCount = owner.claimedOrdersCount.plus(ONE_BI);
            
            if (owner.id != ADDRESS_DEV) {
                exchange.ordersClaimedCount = exchange.ordersClaimedCount.plus(ONE_BI);
            }
        }

        order.amountClaimed = order.amountFilled;
        order.save();
    }
    
    // Add new user active day
    if (isNewDay(owner.lastActiveDate, event.block.timestamp)) {
        owner.daysActive = owner.daysActive.plus(ONE_BI);
        owner.lastActiveDate = event.block.timestamp;
        
        if (owner.id != ADDRESS_DEV) {
            exchange.totalUserActiveDays = exchange.totalUserActiveDays.plus(ONE_BI);
        }
    }
    
    owner.cancelledOrdersCount = owner.cancelledOrdersCount.plus(BigInt.fromI32(orderIds.length));
    owner.save();

    if (owner.id != ADDRESS_DEV) {
        exchange.ordersCancelledCount = exchange.ordersCancelledCount.plus(BigInt.fromI32(orderIds.length));
    }
    exchange.save();
}

export function handleOrdersClaimed(event: OrdersClaimedEvent): void {
    if (isTransactionInvalid(event.block.timestamp)) {
        return;
    }
    
    let orderIds = event.params.orderIds;
    let exchange = Exchange.load(event.address.toHexString())!;
    let owner = Account.load(event.params.owner.toHexString().toLowerCase())!;
    for (let j = 0; j < orderIds.length; ++j) {
        let orderId = orderIds[j];

        // Update order status
        let order = Order.load(orderId.toHexString())!;
        
        // Only set to 'Claimed' if the order is fully filled. If it is not, maintain PartiallyFilled 
        // status. All the necessary checks are done on the smart contract so no need to verify incoming
        // data.
        if (order.status == "Filled") {
            order.status = "Claimed";
        }

        if (order.amountFilled != order.amountClaimed) {          
            order.amountClaimed = order.amountFilled;
            owner.claimedOrdersCount = owner.claimedOrdersCount.plus(ONE_BI);
          
            if (owner.id != ADDRESS_DEV) {
                exchange.ordersClaimedCount = exchange.ordersClaimedCount.plus(ONE_BI);
            }
        }
        order.save();
    }
    
    // Add new user active day
    if (isNewDay(owner.lastActiveDate, event.block.timestamp)) {
        owner.daysActive = owner.daysActive.plus(ONE_BI);
        owner.lastActiveDate = event.block.timestamp;
        if (owner.id != ADDRESS_DEV) {
            exchange.totalUserActiveDays = exchange.totalUserActiveDays.plus(ONE_BI);
        }
    }
    
    owner.save();
    exchange.save();
}

function createAddressResolver(id: Address): Resolver {
    let resolver = new Resolver(id.toHexString());
    resolver.save();
    return resolver;
}

function createAccount(address: Address, timestamp: BigInt): Account {
    let account = new Account(address.toHexString().toLowerCase());
    account.ordersCount = ZERO_BI;
    account.orderFillsCount = ZERO_BI;
    account.cancelledOrdersCount = ZERO_BI;
    account.claimedOrdersCount = ZERO_BI;
    account.makerVolume = ZERO_BI;
    account.takerVolume = ZERO_BI;
    account.uniqueAssetsCount = ZERO_BI;
    account.daysActive = ONE_BI;
    account.lastActiveDate = timestamp;
    account.contractsDeployedCount = ZERO_BI;
    account.assetsDeployedCount = ZERO_BI;
    account.save();
    return account;
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

function createOrder(id: BigInt, assetId: string, owner: string, exchangeId: string): Order {
    let order = new Order(id.toHexString());
    order.asset = assetId;
    order.exchange = exchangeId;
    order.owner = owner;
    order.amountOrdered = ZERO_BI;
    order.amountFilled = ZERO_BI;
    order.amountClaimed = ZERO_BI;
    order.status = "Ready";
    order.price = ZERO_BI;
    order.save();
    return order;
}

function isNewDay(lastActiveTimestamp: BigInt, currentTimestamp: BigInt): boolean {
    let currentTimestampInt = currentTimestamp.toI32();
    let currentDayId = currentTimestampInt / SECONDS_PER_DAY;
    let lastActiveTimestampInt = lastActiveTimestamp.toI32();
    let lastActiveDayId = lastActiveTimestampInt / SECONDS_PER_DAY;
    if (lastActiveDayId < currentDayId) {
        return true;
    }
    return false;
}

function isTransactionInvalid(transactionTimestamp: BigInt): boolean {
    return transactionTimestamp > SNAPSHOT_TIMESTAMP;
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
    exchange.ordersCount = ZERO_BI;
    exchange.orderFillsCount = ZERO_BI;
    exchange.ordersClaimedCount = ZERO_BI;
    exchange.ordersCancelledCount = ZERO_BI;
    exchange.makerVolume = ZERO_BI;
    exchange.takerVolume = ZERO_BI;
    
    // Need to add this to total users because user active days starts at 1
    exchange.totalUserActiveDays = ZERO_BI;
    exchange.save();
    return exchange;
}