import { log, ByteArray, BigInt, Address, crypto, store } from "@graphprotocol/graph-ts"
import { ADDRESS_ZERO, ONE_BI, ZERO_BI } from "./constants";

import { 
    AddressResolver as Resolver,
    Exchange,
    ContentFactory,
    Account,
    Order,
    OrderClaimTransaction,
    OrderFill,
    Asset
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
    Exchange as ExchangeTemplate,
    ContentFactory as ContentFactoryTemplate
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
    } else {
        log.info('-------- LOG: Resolver - Ignoring registered address: {}', [event.params.id.toHexString()]);
    }
}
export function handleContractsDeployed(event: ContractsDeployedEvent): void {
    // Todo:
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

export function createExchange(address: Address): Exchange {
    let exchange = new Exchange(address.toHexString());
    exchange.OrdersCount = ZERO_BI;
    exchange.OrderFillsCount = ZERO_BI;
    exchange.save();
    return exchange;
}