import { metaMorphoFactoryAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho-factory";
import { morphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/morpho";
import useContractEvents from "@morpho-blue-offchain-public/uikit/hooks/use-contract-events/use-contract-events";
import { readAccrualVaults, readAccrualVaultsStateOverride } from "@morpho-blue-offchain-public/uikit/lens/read-vaults";
import { restructure } from "@morpho-blue-offchain-public/uikit/lib/restructure";
import { getTokenSymbolURI, Token } from "@morpho-blue-offchain-public/uikit/lib/utils";
import { AccrualPosition } from "@morpho-org/blue-sdk";
import { useMemo } from "react";
import { useOutletContext } from "react-router";
import { type Address, erc20Abi, type Chain, zeroAddress, type Hex } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { BorrowPositionTable, BorrowTable } from "@/components/borrow-table";
import { CtaCard } from "@/components/cta-card";
import { useMarkets } from "@/hooks/use-markets";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@/lib/constants";

const STALE_TIME = 5 * 60 * 1000;

export function BorrowSubPage() {
  const { status, address: userAddress } = useAccount();
  const { chain } = useOutletContext() as { chain?: Chain };
  const chainId = chain?.id;

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // MARK: Index `MetaMorphoFactory.CreateMetaMorpho` on all factory versions to get a list of all vault addresses
  const {
    logs: { all: createMetaMorphoEvents },
    fractionFetched,
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1 ? [factoryV1_1.address].concat(factory ? [factory.address] : []) : [],
    fromBlock: factory?.fromBlock ?? factoryV1_1?.fromBlock,
    reverseChronologicalOrder: true,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined },
  });

  // MARK: Fetch additional data for vaults owned by the top 5 curators from core deployments
  const top5Curators = useTopNCurators({ n: 5, verifiedOnly: true, chainIds: [...CORE_DEPLOYMENTS] });
  const { data: vaultsData } = useReadContract({
    chainId,
    ...readAccrualVaults(
      morpho?.address ?? "0x",
      createMetaMorphoEvents.map((ev) => ev.args.metaMorpho),
      // NOTE: This assumes that if a curator controls an address on one chain, they control it across all chains.
      top5Curators.flatMap((curator) => curator.addresses?.map((entry) => entry.address as Address) ?? []),
    ),
    stateOverride: [readAccrualVaultsStateOverride()],
    query: {
      enabled: chainId !== undefined && fractionFetched > 0.99 && !!morpho?.address,
      staleTime: STALE_TIME,
      gcTime: Infinity,
      notifyOnChangeProps: ["data"],
    },
  });

  const marketIds = useMemo(() => [...new Set(vaultsData?.flatMap((d) => d.vault.withdrawQueue) ?? [])], [vaultsData]);
  const markets = useMarkets({ chainId, marketIds, staleTime: STALE_TIME, fetchPrices: true });
  const marketsArr = useMemo(() => {
    const marketsArr = Object.values(markets).filter(
      (market) =>
        market.liquidity > 0n &&
        ![market.params.collateralToken, market.params.loanToken, market.params.irm, market.params.oracle].includes(
          zeroAddress,
        ),
    );
    marketsArr.sort((a, b) => {
      const primary = a.params.loanToken.localeCompare(b.params.loanToken);
      const secondary = a.liquidity > b.liquidity ? -1 : 1;
      return primary === 0 ? secondary : primary;
    });
    return marketsArr;
  }, [markets]);

  const { data: erc20Symbols } = useReadContracts({
    contracts: marketsArr
      .map((market) => [
        { chainId, address: market.params.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { chainId, address: market.params.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals } = useReadContracts({
    contracts: marketsArr
      .map((market) => [
        { chainId, address: market.params.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { chainId, address: market.params.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: positionsRaw, refetch: refetchPositionsRaw } = useReadContracts({
    contracts: marketsArr.map(
      (market) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "position",
          args: userAddress ? [market.id, userAddress] : undefined,
        }) as const,
    ),
    allowFailure: false,
    query: {
      staleTime: 1 * 60 * 1000,
      gcTime: Infinity,
      enabled: !!morpho,
      select(data) {
        return data.map((x) => restructure(x, { abi: morphoAbi, name: "position", args: ["0x", "0x"] }));
      },
    },
  });

  const positions = useMemo(() => {
    if (marketsArr.length === 0 || positionsRaw === undefined || userAddress === undefined) {
      return undefined;
    }

    const map = new Map<Hex, AccrualPosition>();
    positionsRaw?.forEach((positionRaw, idx) => {
      const market = marketsArr[idx];
      map.set(market.id, new AccrualPosition({ user: userAddress, ...positionRaw }, market));
    });
    return map;
  }, [marketsArr, positionsRaw, userAddress]);

  const tokens = useMemo(() => {
    const map = new Map<Address, Token>();
    marketsArr.forEach((market, idx) => {
      const collateralTokenSymbol = erc20Symbols?.[idx * 2].result;
      const loanTokenSymbol = erc20Symbols?.[idx * 2 + 1].result;
      map.set(market.params.collateralToken, {
        address: market.params.collateralToken,
        symbol: collateralTokenSymbol,
        decimals: erc20Decimals?.[idx * 2].result,
        imageSrc: getTokenSymbolURI(collateralTokenSymbol),
      });
      map.set(market.params.loanToken, {
        address: market.params.loanToken,
        symbol: loanTokenSymbol,
        decimals: erc20Decimals?.[idx * 2 + 1].result,
        imageSrc: getTokenSymbolURI(loanTokenSymbol),
      });
    });
    return map;
  }, [marketsArr, erc20Symbols, erc20Decimals]);

  if (status === "reconnecting") return undefined;

  const userMarkets = marketsArr.filter((market) => positions?.get(market.id)?.collateral ?? 0n > 0n);

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      {status === "disconnected" ? (
        <CtaCard
          className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:grid md:grid-cols-[50%_50%] md:px-0 dark:bg-neutral-900"
          bigText="Provide collateral to borrow any asset"
          littleText="Connect wallet to get started"
          videoSrc={{
            mov: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.mov",
            webm: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.webm",
          }}
        />
      ) : (
        userMarkets.length > 0 && (
          <div className="flex h-fit w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:px-0 dark:bg-neutral-900">
            <div className="text-primary w-full max-w-5xl px-8 pt-8">
              <BorrowPositionTable
                chain={chain}
                markets={userMarkets}
                tokens={tokens}
                positions={positions}
                refetchPositions={refetchPositionsRaw}
              />
            </div>
          </div>
        )
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl pb-32">
        <div className="text-primary w-full max-w-5xl px-8 pt-8">
          <BorrowTable chain={chain} markets={marketsArr} tokens={tokens} refetchPositions={refetchPositionsRaw} />
        </div>
      </div>
    </div>
  );
}
