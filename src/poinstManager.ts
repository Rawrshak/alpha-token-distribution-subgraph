import { 
    SNAPSHOT_TIMESTAMP,
    ADDRESS_ZERO,
    ADDRESS_DEV,
    ONE_BI,
    ZERO_BI,
    SECONDS_PER_DAY,
    WEEKLY_EVENTS_ADDRESS,
    Week1TokenIds,
    Week2TokenIds,
    Week3TokenIds,
    CorrectTokenIds,
    WEEK_1_END_TIMESTAMP,
    WEEK_2_END_TIMESTAMP,
    WEEK_3_END_TIMESTAMP
} from "./constants";
import { log, ByteArray, BigInt, Address, crypto, store } from "@graphprotocol/graph-ts"

import {
    ContentStatisticsManager,
    Account,
    WeeklyEventParticipation
} from "../generated/schema";

export function updateWeeklyPoints(week: i32, userId: string, contentStatsManId: string, content: string, tokenId: BigInt, timestamp: BigInt, assetBalance: BigInt, isAssetNewlyAcquired: boolean): void {
    if (isWeeklyAssetAcquired(content, tokenId, week) && isBeforeWeeklyDeadline(timestamp, week)) {
        let weeklyEvent = WeeklyEventParticipation.load(getWeeklyEventId(userId, week));
        if (weeklyEvent == null) {
            weeklyEvent = createWeeklyEvent(userId, week);
            let user = Account.load(userId)!;
            if (week == 1) { user.week1 = weeklyEvent.id; }
            else if (week == 2) { user.week2 = weeklyEvent.id; }
            else if (week == 3) { user.week3 = weeklyEvent.id; }
            user.save();

            updatePointsTotal(contentStatsManId, week, weeklyEvent.points, true);
        }

        if (assetBalance == ONE_BI) {
            if (!weeklyEvent.disqualified && isAssetNewlyAcquired) { 
                if (isCorrectAssetAcquired(tokenId)) {
                    weeklyEvent.points = weeklyEvent.points.plus(ONE_BI);
                    updatePointsTotal(contentStatsManId, week, ONE_BI, true);
                } else {
                    weeklyEvent.points = weeklyEvent.points.minus(ONE_BI);
                    updatePointsTotal(contentStatsManId, week, ONE_BI, false);
                }
            }
        } else {
            // subtract the disqualified user's points 
            updatePointsTotal(contentStatsManId, week, weeklyEvent.points, false);
            weeklyEvent.disqualified = true;
            weeklyEvent.points = ZERO_BI; 
        }
        weeklyEvent.save();
    }
}

function updatePointsTotal(contentStatsManId: string, week: i32, amount: BigInt, add: boolean): void {
    let contentStatsMan = ContentStatisticsManager.load(contentStatsManId)!;

    if (add) {
        if (week == 1) {
            contentStatsMan.w1TotalPoints = contentStatsMan.w1TotalPoints.plus(amount);
        } else if (week == 2) {
            contentStatsMan.w2TotalPoints = contentStatsMan.w2TotalPoints.plus(amount);
        } else if (week == 3) {
            contentStatsMan.w3TotalPoints = contentStatsMan.w3TotalPoints.plus(amount);
        }
    } else {
        if (week == 1) {
            contentStatsMan.w1TotalPoints = contentStatsMan.w1TotalPoints.minus(amount);
        } else if (week == 2) {
            contentStatsMan.w2TotalPoints = contentStatsMan.w2TotalPoints.minus(amount);
        } else if (week == 3) {
            contentStatsMan.w3TotalPoints = contentStatsMan.w3TotalPoints.minus(amount);
        }
    }

    contentStatsMan.save();
}


function createWeeklyEvent(user: string, week: i32) : WeeklyEventParticipation {
    let event = new WeeklyEventParticipation(getWeeklyEventId(user, week));
    event.week = week;
    if (week == 1) {
        event.points = BigInt.fromI32(2);
    } else if (week == 2) {
        event.points = BigInt.fromI32(5);
    } else if (week == 3) {
        event.points = BigInt.fromI32(3);
    } else {
        event.points = ZERO_BI;
    }
    event.bonus = false;
    event.disqualified = false;
    event.save();
    return event;
}

function getWeeklyEventId(user: string, week: i32): string {
    return user + '-' + week.toString();
}

function isBeforeWeeklyDeadline(timestamp: BigInt, week: i32): boolean {
    if (week == 1) {
        return timestamp <= WEEK_1_END_TIMESTAMP;
    } else if (week == 2) {
        return timestamp <= WEEK_2_END_TIMESTAMP;
    } else if (week == 3) {
        return timestamp <= WEEK_3_END_TIMESTAMP;
    }
    return false; 
}

export function isCorrectAssetAcquired(tokenId: BigInt): boolean {
    for (let i = 0; i < CorrectTokenIds.length; ++i) { 
        if (tokenId == CorrectTokenIds[i]) {
            return true;
        }
    }
    return false;
}

export function isWeeklyAssetAcquired(contract: string, tokenId: BigInt, week: i32): boolean {
    if (contract != WEEKLY_EVENTS_ADDRESS) {
        return false;
    }

    if (week == 1) {
        return checkAgainstTokenIds(Week1TokenIds, tokenId);
    } else if (week == 2) {
        return checkAgainstTokenIds(Week2TokenIds, tokenId);
    } else if (week == 3) {
        return checkAgainstTokenIds(Week3TokenIds, tokenId);
    }

    return false;
}

function checkAgainstTokenIds(tokenIds: Array<BigInt>, tokenId: BigInt): boolean {
    for (let i = 0; i < tokenIds.length; ++i) { 
        if (tokenId == tokenIds[i]) {
            return true;
        }
    }
    return false;
}
