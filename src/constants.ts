import { BigInt } from '@graphprotocol/graph-ts'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ADDRESS_DEV = '0xb796bce3db9a9dfb3f435a375f69f43a104b4caf';

export const WEEKLY_EVENTS_ADDRESS = '0x9ce34990a231d665004fa2582957c3f1ce1b47c7';

// Set week 1 token ids
export let Week1TokenIds = new Array<BigInt>(5);
Week1TokenIds[0] = BigInt.fromI32(0);
Week1TokenIds[1] = BigInt.fromI32(1);
Week1TokenIds[2] = BigInt.fromI32(2);
Week1TokenIds[3] = BigInt.fromI32(3);
Week1TokenIds[4] = BigInt.fromI32(4);

// Set week 2 token ids
export let Week2TokenIds = new Array<BigInt>(10);
Week2TokenIds[0] = BigInt.fromI32(10);
Week2TokenIds[1] = BigInt.fromI32(11);
Week2TokenIds[2] = BigInt.fromI32(12);
Week2TokenIds[3] = BigInt.fromI32(13);
Week2TokenIds[4] = BigInt.fromI32(14);
Week2TokenIds[5] = BigInt.fromI32(5);
Week2TokenIds[6] = BigInt.fromI32(6);
Week2TokenIds[7] = BigInt.fromI32(7);
Week2TokenIds[8] = BigInt.fromI32(8);
Week2TokenIds[9] = BigInt.fromI32(9);

// Set week 3 token ids
export let Week3TokenIds = new Array<BigInt>(10);
Week3TokenIds[0] = BigInt.fromI32(24);
Week3TokenIds[1] = BigInt.fromI32(25);
Week3TokenIds[2] = BigInt.fromI32(26);
Week3TokenIds[3] = BigInt.fromI32(27);
Week3TokenIds[4] = BigInt.fromI32(28);
Week3TokenIds[5] = BigInt.fromI32(31);

// Todo: Update set of correct token ids
// Set of correct weekly tokens
export let CorrectTokenIds = new Array<BigInt>(11);
CorrectTokenIds[0] = BigInt.fromI32(0); // Galaga
CorrectTokenIds[1] = BigInt.fromI32(1); // Puckman
CorrectTokenIds[2] = BigInt.fromI32(2); // Joust
CorrectTokenIds[3] = BigInt.fromI32(13); // Doom - Doom Slayer
CorrectTokenIds[4] = BigInt.fromI32(8); // Ocarina - Link
CorrectTokenIds[5] = BigInt.fromI32(9); // Mortal Kombat - Sub-Zero
CorrectTokenIds[6] = BigInt.fromI32(5); // Jill Valentine
CorrectTokenIds[7] = BigInt.fromI32(11);    // Final Fantasy - Tifa Lockheart
CorrectTokenIds[8] = BigInt.fromI32(25); // PS2
CorrectTokenIds[9] = BigInt.fromI32(28); // Nintendo Game Cube
CorrectTokenIds[10] = BigInt.fromI32(27); // Xbox One


export const WEEK2_BONUS_CONTRACT_ADDRESS = '0x20af0c7dd43fc91e7e8f449692f26adc2fa69ee4';
export let Week2BonusTokenId = BigInt.fromI32(9);
export let Week3BonusTokenId = BigInt.fromI32(29);

// Jan 26, 2022, 12 PM PST
export const WEEK_1_END_TIMESTAMP = BigInt.fromI32(1643227200);

// Feb 3, 2022, 12 PM PST
export const WEEK_2_END_TIMESTAMP = BigInt.fromI32(1643918400);

// Feb 10, 2022, 12 PM PST
export const WEEK_3_END_TIMESTAMP = BigInt.fromI32(1644523200);

// March 31st, 2022, 9 PM PST
export const SNAPSHOT_TIMESTAMP = BigInt.fromI32(1648785600);

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let SECONDS_PER_DAY = 86400;