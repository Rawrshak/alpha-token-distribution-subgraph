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

    // Listen for ContentStorage Events
    let contentManagerContract = ContentManagerContract.bind(event.params.content);
    ContentStorageTemplate.create(contentManagerContract.contentStorage());
}

// ContentStorage Events
export function handleAssetsAdded(event: AssetsAddedEvent): void {
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

    // add the number of assets
    let contentStatsMan = ContentStatisticsManager.load(parent.factory)!;
    contentStatsMan.assetsCount = contentStatsMan.assetsCount.plus(BigInt.fromI32(tokenIds.length));
    contentStatsMan.save();
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
        
        if (event.params.to.toHex() != ADDRESS_ZERO) {
            // receiver exists
            let receiver = Account.load(event.params.to.toHexString());
            if (receiver == null) {
                // Add new user account
                receiver = createAccount(event.params.to, event.block.timestamp);
                
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

    let amount = event.params.value;
    if (event.params.to.toHex() != ADDRESS_ZERO) {
        // receiver exists
        let receiver = Account.load(event.params.to.toHexString());
        if (receiver == null) {
            // Add new owner
            receiver = createAccount(event.params.to, event.block.timestamp);
            
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
    let assetId = getAssetId(event.params.order.asset.contentAddress.toHexString(), event.params.order.asset.tokenId.toString());

    // Create asset object if it doesn't already exist
    let asset = Asset.load(assetId)!;

    // Create Owner account object if it doesn't already exist
    let ownerAcc = Account.load(event.params.order.owner.toHexString());
    if (ownerAcc == null) {
        ownerAcc = createAccount(event.params.order.owner, event.block.timestamp);
    }
    ownerAcc.ordersCount = ownerAcc.ordersCount.plus(ONE_BI);
    ownerAcc.save();
    
    let exchange = Exchange.load(event.address.toHexString())!;

    // Create Order
    let order = createOrder(event.params.orderId, assetId, ownerAcc.id, exchange.id);
    order.type = (event.params.order.isBuyOrder) ? "Buy" : "Sell";
    order.price = event.params.order.price;
    order.amountOrdered = event.params.order.amount;
    order.save();
    
    // Update exchange data
    exchange.ordersCount = exchange.ordersCount.plus(ONE_BI);
    exchange.save();
}

export function handleOrdersFilled(event: OrdersFilledEvent): void {
    let taker = Account.load(event.params.from.toHexString());
    if (taker == null) {
        taker = createAccount(event.params.from, event.block.timestamp);
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
        let maker = Account.load(order.owner)!;
        maker.makerVolume = maker.makerVolume.plus(volume)
        maker.save();

        // Update exchange data
        exchange.orderFillsCount = exchange.orderFillsCount.plus(ONE_BI);
        exchange.orderVolume = exchange.orderVolume.plus(volume)

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
    taker.save();
    exchange.save();

    // Todo: Count Active Days 
}

export function handleOrdersDeleted(event: OrdersDeletedEvent): void {
    let orderIds = event.params.orderIds;
    let exchange = Exchange.load(event.address.toHexString())!;
    let owner = Account.load(event.params.owner.toHexString())!;

    for (let j = 0; j < orderIds.length; ++j) {
        let orderId = orderIds[j];

        // Update order status
        let order = Order.load(orderId.toHexString())!;
        order.status = "Cancelled";

        // if there is an unclaimed amount still, we add a claim order stat
        if (order.amountClaimed != order.amountFilled) {
            owner.claimedOrdersCount = owner.claimedOrdersCount.plus(ONE_BI);
            exchange.ordersClaimedCount = exchange.ordersClaimedCount.plus(ONE_BI);
        }

        order.amountClaimed = order.amountFilled;
        order.save();
    }
    
    owner.cancelledOrdersCount = owner.cancelledOrdersCount.plus(BigInt.fromI32(orderIds.length));
    owner.save();

    exchange.ordersCancelledCount = exchange.ordersCancelledCount.plus(BigInt.fromI32(orderIds.length));
    exchange.save();
}

export function handleOrdersClaimed(event: OrdersClaimedEvent): void {
    let orderIds = event.params.orderIds;
    let exchange = Exchange.load(event.address.toHexString())!;
    let owner = Account.load(event.params.owner.toHexString())!;
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
          exchange.ordersClaimedCount = exchange.ordersClaimedCount.plus(ONE_BI);
        }
        order.save();
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
    let account = new Account(address.toHexString());
    account.ordersCount = ZERO_BI;
    account.orderFillsCount = ZERO_BI;
    account.cancelledOrdersCount = ZERO_BI;
    account.claimedOrdersCount = ZERO_BI;
    account.makerVolume = ZERO_BI;
    account.takerVolume = ZERO_BI;
    account.daysActive = ONE_BI;
    account.uniqueAssetsCount = ZERO_BI;
    account.lastActiveDate = timestamp;
    account.save();
    return account;
}
  
// export function createAsset(id: string, parent: string, tokenId: BigInt): Asset {
//     let asset = new Asset(id);
//     asset.tokenId = tokenId;
//     asset.parentContract = parent;
//     asset.save();

//     // Update Content asset count
//     let content = Content.load(parent)!;
//     content.assetsCount = content.assetsCount.plus(ONE_BI);
//     content.save();

//     return asset;
// }
  
function createAssetBalance(id: string, assetId: string, owner: string): AssetBalance {
    let asset = Asset.load(assetId)!;
    let balance = new AssetBalance(id);
    balance.asset = assetId;
    balance.owner = owner;
    balance.amount = ZERO_BI;
    balance.save();
    return balance;
}

export function createOrder(id: BigInt, assetId: string, owner: string, exchangeId: string): Order {
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
    exchange.orderVolume = ZERO_BI;
    exchange.save();
    return exchange;
}