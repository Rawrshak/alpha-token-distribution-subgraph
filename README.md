# Rawrshak's Alpha distribution subgraph

This subgraph contains the Alpha testnet RAWR token rewards for users who participated in Rawrshak's Alpha testnet from January 12th, 2022 to March 31st, 2022.

The data used to get these calculations are from the contracts from the alpha testnet on Optimism's Kovan Testnet. 

0.5% of the RAWR token is allocated for the Alpha testnet users. Please note that initially, the announcement said 500,000 RAWR tokens were allocated. However, as we are extremely early, the total RAWR supply is subject to change before the token launch. This depends on the RAWR tokenomics. Initially, 100,000,000 RAWR tokens was the target. We make note here that we're allocating 0.5% token supply for the Alpha testnet users. 

The distribution is as below, with the assumption of 500,000 RAWR tokens (0.5% of 100,000,000 max supply):

Users | Amount
Gamers and Asset holders | 250,000 RAWR
Content Creators and Asset Creators | 125,000 RAWR
Rawrshak Event participants | 75,000 RAWR
Bug Bounty Rewards, Feedback Rewards | 50,000 RAWR

Note: Bug Bounty and Feedback Rewards are subject to be distributed at the Rawrshak dev team's discretion. If not all tokens are distributed during Alpha, the remaining will be allocated in the future.

## Gamer and Asset Holders

We will take a snapshot of the user accounts data on March 31st, 2022. We will distribute the tokens based on a user's share of the total amount per category.

Category | RAWR Token amount
Unique Asset Count | 50,000
Days Active | 25,000
Orders Created Count | 50,000
Order Fill Count | 50,000
Orders Claimed Count | 25,000
Total Volume as Buyer | 25,000
Total Volume as Seller | 25,000

These rewards are allocated to users interacting and testing the different parts of the exchange and accumulating assets throughout the alpha release.

**User's share = (UserData / TotalData) * RAWR Token Amount** 