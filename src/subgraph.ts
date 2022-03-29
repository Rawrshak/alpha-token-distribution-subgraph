import { log, ByteArray, BigInt, Address, crypto, store } from "@graphprotocol/graph-ts"
import { ADDRESS_ZERO, ONE_BI, ZERO_BI } from "./constants";

import { 
    AddressResolver as Resolver,
    Exchange,
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
    Exchange as ExchangeTemplate
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
    } else {
        log.info('-------- LOG: Resolver - Ignoring registered address: {}', [event.params.id.toHexString()]);
    }
}

export function handleOrderPlaced(event: OrderPlacedEvent): void {

}

export function handleOrdersFilled(event: OrdersFilledEvent): void {

}

export function handleOrdersDeleted(event: OrdersDeletedEvent): void {

}

export function handleOrdersClaimed(event: OrdersClaimedEvent): void {
    
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