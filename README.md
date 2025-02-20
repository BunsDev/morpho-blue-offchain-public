# Resilient Web App for Morpho Blue

React web app for Morpho Blue and MetaMorpho contracts that's designed to work using only public RPCs－no other infrastructure required.

## Installation

To get started:

```shell
git clone https://github.com/morpho-org/morpho-blue-offchain-public.git
cd morpho-blue-offchain-public
# Install packages and run
pnpm install
pnpm run dev
```

After running the commands above, open [http://localhost:5173/](http://localhost:5173/) in your browser to use the app.

## Features

- 🦋 View your deposits in MetaMorpho vaults
- 🌌 View your borrow positions
- 📤 Withdraw from MetaMorpho vaults
- ⚡️ Repay loans, add collateral, and remove collateral
- ⛓️ Support any chain with Morpho contracts
- 🏗️ Requires no additional infrastructure/services

> [!TIP]
> The app uses your wallet RPC by default, then falls back to [drpc](https://drpc.org). You can switch the order or add additional RPCs by modifying the `wagmiConfig` in [App.tsx](/src/App.tsx#L25).

## Architecture

This is a single page app built with React 19, Vite, [shadcn](https://ui.shadcn.com), and [wagmi](https://wagmi.sh).

_Key Components_

- [src/App.tsx](/src/App.tsx) -- Defines a `wagmiConfig` and sets up various providers and contexts for data caching
- [src/hooks/use-contract-events.ts](/src/hooks/use-contract-events.ts) -- React hook for calling `eth_getLogs` with retries and caching, respecting an optional constraint on the largest-fetchable block range
- [src/app/dashboard/earn-subpage.tsx](/src/app/dashboard/earn-subpage.tsx) -- Main component for the Earn page. Fetches data as follows:
  1. `CreateMetaMorpho` events, so we know addresses of all MetaMorpho vault contracts
  2. The user's `Deposit` events for _all_ ERC4626 vaults (even non-Morpho). We filter these down using results from (1)
  3. ERC20 symbols and decimals for each underlying asset
  4. Vault info, including name, curator, timelock, and `totalAssets`
- [src/app/dashboard/borrow-subpage.tsx](/src/app/dashboard/earn-subpage.tsx) -- Main component for the Borrow page
  1. `SupplyCollateral` events on the Morpho Blue contract, so we know where the user has (or had) positions
  2. `marketParams` struct for each `marketId` referenced in events from (1)
  3. `markets` struct for each `marketId` referenced in events from (1)
  4. ERC20 symbols and decimals for each `collateralToken` and `loanToken`
- [src/components/ui/...](/src/components/ui/) -- shadcn reusable component library
