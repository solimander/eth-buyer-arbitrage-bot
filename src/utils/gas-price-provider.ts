import { GasPrice, IGasPriceProvider } from '@uniswap/smart-order-router';
import { provider } from '../config';

export class GasPriceProvider implements IGasPriceProvider {
  public async getGasPrice(): Promise<GasPrice> {
    return {
      gasPriceWei: await provider.getGasPrice(),
    };
  }
}
