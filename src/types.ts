import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Wallet } from 'ethers';

export type TokenSymbol = 'USDC';

export type ContractName = 'TokenBuyer' | 'Payer' | 'ArbitrageBot';

export interface UnsignedTransaction {
  signer: Wallet;
  transaction: TransactionRequest;
}

export interface TokenInfo {
  address: string;
  decimals: number;
}

export interface TickInfo {
  id: string;
  tickIdx: string;
  liquidityNet: string;
  liquidityGross: string;
}
