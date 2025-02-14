import { morphoAbi } from "@/assets/abis/morpho";
import { getContractDeploymentInfo } from "@/components/constants";
import useContractEvents from "@/hooks/use-contract-events";
import { useMemo } from "react";
import { useAccount, useBlockNumber, useReadContracts } from "wagmi";
import { Address, erc20Abi, erc4626Abi } from "viem";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { blo } from "blo";
import { formatBalanceWithSymbol, Token } from "@/lib/utils";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { keepPreviousData } from "@tanstack/react-query";
import { metaMorphoFactoryAbi } from "@/assets/abis/meta-morpho-factory";
import { metaMorphoAbi } from "@/assets/abis/meta-morpho";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";

function TokenTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={imageSrc} alt="Avatar" />
      </Avatar>
      {symbol ?? "－"}
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

export function EarnSubPage() {
  const { chainId, address: userAddress } = useAccount();
  const { data: blockNumber } = useBlockNumber({
    watch: false,
    query: { staleTime: Infinity, gcTime: Infinity, refetchOnMount: "always" },
  });

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // MARK: Fetch `Morpho.CreateMarket` so that we have `collateralToken` information for all constituent markets
  const { data: createMarketEvents, isFetching: isFetchingCreateMarketEvents } = useContractEvents({
    abi: morphoAbi,
    address: morpho.address,
    fromBlock: morpho.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    eventName: "CreateMarket",
    strict: true,
    query: { enabled: chainId !== undefined && blockNumber !== undefined },
  });

  // MARK: Fetch `MetaMorphoFactory.CreateMetaMorpho` on all factory versions so that we have all deployments
  const { data: createMetaMorphoEvents, isFetching: isFetchingCreateMetaMorphoEvents } = useContractEvents({
    abi: metaMorphoFactoryAbi,
    address: [factory.address, factoryV1_1.address],
    fromBlock: factory.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: {
      // Wait to fetch so we don't get rate-limited.
      enabled: chainId !== undefined && blockNumber !== undefined && !isFetchingCreateMarketEvents,
    },
  });

  // MARK: Fetch `ERC4626.Deposit` so that we know where user has deposited. Includes non-MetaMorpho ERC4626 deposits
  const { data: depositEvents, isFetching: isFetchingDepositEvents } = useContractEvents({
    abi: erc4626Abi,
    fromBlock: factory.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    eventName: "Deposit", // ERC-4626
    args: { receiver: userAddress },
    strict: true,
    query: {
      enabled:
        chainId !== undefined &&
        blockNumber !== undefined &&
        userAddress !== undefined &&
        // Wait to fetch so we don't get rate-limited.
        !isFetchingCreateMetaMorphoEvents,
    },
  });

  // MARK: Figure out what vaults the user is actually in, and the set of assets involved
  const [filteredCreateMetaMorphoArgs, assets] = useMemo(() => {
    const args = createMetaMorphoEvents
      .filter((ev) => depositEvents.some((deposit) => deposit.address === ev.args.metaMorpho.toLowerCase()))
      .map((ev) => ev.args);
    const unique = Array.from(new Set(args.map((x) => x.asset)));
    return [args, unique];
  }, [createMetaMorphoEvents, depositEvents]);

  // MARK: Fetch metadata for every ERC20 asset
  const { data: assetsInfo, isFetching: isFetchingAssetsInfo } = useReadContracts({
    contracts: assets
      .map((asset) => [
        { address: asset, abi: erc20Abi, functionName: "symbol" } as const,
        { address: asset, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  // MARK: Fetch metadata for every MetaMorpho vault
  const { data: vaultsInfo, isFetching: isFetchingVaultsInfo } = useReadContracts({
    contracts: filteredCreateMetaMorphoArgs
      .map((args) => [
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "owner" } as const,
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "curator" } as const,
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "guardian" } as const,
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "timelock" } as const,
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "name" } as const,
        { address: args.metaMorpho, abi: metaMorphoAbi, functionName: "totalAssets" } as const,
      ])
      .flat(),
    allowFailure: false,
    query: { staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData },
  });

  const vaults = useMemo(() => {
    return filteredCreateMetaMorphoArgs.map((args, idx) => {
      const assetIdx = assets.indexOf(args.asset);
      return {
        address: args.metaMorpho,
        imageSrc: blo(args.metaMorpho),
        info: vaultsInfo
          ? {
              owner: vaultsInfo[idx * 6 + 0] as Address,
              curator: vaultsInfo[idx * 6 + 1] as Address,
              guardian: vaultsInfo[idx * 6 + 2] as Address,
              timelock: vaultsInfo[idx * 6 + 3] as bigint,
              name: vaultsInfo[idx * 6 + 4] as string,
              totalAssets: vaultsInfo[idx * 6 + 5] as bigint,
            }
          : undefined,
        asset: {
          address: args.asset,
          imageSrc: blo(args.asset),
          symbol: assetIdx > -1 ? assetsInfo?.[assetIdx * 2 + 0].result : undefined,
          decimals: assetIdx > -1 ? assetsInfo?.[assetIdx * 2 + 1].result : undefined,
        } as Token,
      };
    });
  }, [filteredCreateMetaMorphoArgs, assets, assetsInfo, vaultsInfo]);

  console.log(createMarketEvents, isFetchingDepositEvents, isFetchingAssetsInfo, isFetchingVaultsInfo);

  return (
    <div className="flex min-h-screen flex-col px-2.5">
      <div className="h-[380px] px-8 py-18 md:p-32 dark:bg-neutral-900"></div>
      <div className="bg-background dark:bg-background/70 flex grow justify-center rounded-t-xl">
        <div className="text-primary w-full max-w-7xl px-8 pt-8 pb-32 md:px-32">
          <Table className="border-separate border-spacing-y-3">
            <TableCaption>
              Showing vaults where you've deposited.
              <br />
              Click on a vault to manage your deposit.
            </TableCaption>
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
                <TableHead className="text-primary text-xs font-light">Asset</TableHead>
                <TableHead className="text-primary text-xs font-light">Deposits</TableHead>
                <TableHead className="text-primary text-xs font-light">Curator</TableHead>
                <TableHead className="text-primary rounded-r-lg text-xs font-light">Timelock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vaults.map((vault) => (
                <Sheet key={vault.address}>
                  <SheetTrigger asChild>
                    <TableRow className="bg-secondary">
                      <TableCell className="rounded-l-lg p-5">
                        <TokenTableCell address={vault.address} symbol={vault.info?.name} imageSrc={vault.imageSrc} />
                      </TableCell>
                      <TableCell>
                        <TokenTableCell {...vault.asset} />
                      </TableCell>
                      <TableCell>
                        {vault.info && vault.asset.decimals
                          ? formatBalanceWithSymbol(vault.info.totalAssets, vault.asset.decimals, vault.asset.symbol)
                          : "－"}
                      </TableCell>
                      <TableCell>
                        {vault.info ? `${vault.info.owner.slice(0, 6)}...${vault.info.owner.slice(-4)}` : "－"}
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        {vault.info ? humanizeDuration(Number(vault.info.timelock) * 1000) : "－"}
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  {/* <BorrowSheetContent
                    marketId={args.id as MarketId}
                    marketParams={new MarketParams(args.marketParams)}
                    tokens={tokens}
                  /> */}
                </Sheet>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
