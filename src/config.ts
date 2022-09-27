import { Percent, SupportedChainId, Token } from '@uniswap/sdk-core';
import { providers, BigNumber as EthersBN, Wallet, Contract } from 'ethers';
import { ContractName, TokenInfo, TokenSymbol } from './types';
import { AlphaRouter, nativeOnChain } from '@uniswap/smart-order-router';
import { FlashbotsTransactionClient, GraphQLPaginationClient } from './utils';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { gql } from 'graphql-request';
import { TokenBuyerABI } from './abi';
import { config } from 'dotenv';
import { Logger } from 'tslog';

config();

const tokens: Record<number, Record<TokenSymbol, TokenInfo>> = {
  [SupportedChainId.MAINNET]: {
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
  },
};

const addresses: Record<number, Record<ContractName, { address: string }>> = {
  [SupportedChainId.MAINNET]: {
    TokenBuyer: {
      address: '0xc32609c91d6b6b51d48f2611308fef121b02041f',
    },
    Payer: {
      address: '0x8e45c0936fa1a65bdad3222befec6a03c83372ce',
    },
    ArbitrageBot: {
      address: '0x262e2b50219620226c5fb5956432a88fffd94ba7',
    },
  },
};

export const JSON_RPC_URL = process.env.JSON_RPC_URL;
export const PRIVATE_KEY = process.env.PRIVATE_KEY;
export const AUTH_SIGNER_PRIVATE_KEY = process.env.AUTH_SIGNER_PRIVATE_KEY || PRIVATE_KEY;
export const CHAIN_ID = parseInt(process.env.CHAIN_ID!) || SupportedChainId.MAINNET;
// prettier-ignore
export const OPPORTUNITY_CHECK_INTERVAL_SEC = parseInt(process.env.OPPORTUNITY_CHECK_INTERVAL_SEC!) || 60;
// prettier-ignore
export const TOKENS = tokens[CHAIN_ID] || (() => { throw new Error(`No tokens for chain ID: ${CHAIN_ID}`) })();
// prettier-ignore
export const CONTRACT_ADDRESSES = addresses[CHAIN_ID] || (() => { throw new Error(`No contract addresses for chain ID: ${CHAIN_ID}`) })();

export const UNISWAP_V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
export const FLASHBOTS_RELAY = 'https://relay.flashbots.net';

export const BN_0 = EthersBN.from(0);
export const BN_18 = EthersBN.from(10).pow(18);
export const BN_36 = EthersBN.from(10).pow(36);

const { USDC } = TOKENS;
const { TokenBuyer, Payer } = CONTRACT_ADDRESSES;

export const OPTIMAL_PRICE_ROUNDING_MARGIN = EthersBN.from(10).pow(USDC.decimals).mul(1_000);

export const logger = new Logger({ displayFilePath: 'hidden' });
export const provider = new providers.JsonRpcProvider(JSON_RPC_URL);
export const signer = new Wallet(PRIVATE_KEY!, provider);
export const authSigner = new Wallet(AUTH_SIGNER_PRIVATE_KEY!);
export const tokenBuyer = new Contract(TokenBuyer.address, TokenBuyerABI, signer);
export const usdc = new Token(CHAIN_ID, USDC.address, USDC.decimals);
export const eth = nativeOnChain(CHAIN_ID);
export const flashbotsProvider = new FlashbotsBundleProvider(
  provider,
  authSigner,
  {
    url: FLASHBOTS_RELAY,
  },
  CHAIN_ID,
);
export const flashbots = new FlashbotsTransactionClient(provider, flashbotsProvider, logger);
export const router = new AlphaRouter({ chainId: CHAIN_ID, provider });
export const uniswapClient = new GraphQLPaginationClient(
  'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
);
export const poolTicksQuery = gql`
  query UniswapV3PoolTicks($pool: String, $cursor: String, $first: Int = 1000) {
    ticks(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, pool: $pool }) {
      id
      tickIdx
      liquidityNet
      liquidityGross
    }
  }
`;
export const swapConfig = {
  recipient: Payer.address, // Send funds directly to the payer
  slippageTolerance: new Percent(1, 100), // 1%
  deadline: Math.floor(Date.now() / 1000 + 1800), // 3 minutes
};
