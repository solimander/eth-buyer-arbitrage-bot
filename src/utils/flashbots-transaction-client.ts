import {
  FlashbotsBundleProvider,
  FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction,
  FlashbotsTransactionResponse,
} from '@flashbots/ethers-provider-bundle';
import { providers } from 'ethers';
import { UnsignedTransaction } from '../types';
import retry from 'async-retry';
import { Logger } from 'tslog';

export class FlashbotsTransactionClient {
  constructor(
    private readonly _provider: providers.JsonRpcProvider,
    private readonly _flashbots: FlashbotsBundleProvider,
    private readonly _logger: Logger,
  ) {}

  /**
   * Submit a transaction to flashbots
   * @param unsigned An unsigned transaction
   */
  public async submitToFlashbots(unsigned: UnsignedTransaction) {
    const transactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
      unsigned,
    ];
    const signedTransactions = await this._flashbots.signBundle(transactions);

    const blockNumber = await this._provider.getBlockNumber();

    const bundleSubmission = await this._flashbots.sendRawBundle(
      signedTransactions,
      blockNumber + 1,
    );
    this._logger.info('Flashbots bundle submitted...');

    if ('error' in bundleSubmission) {
      throw new Error(bundleSubmission.error.message);
    }

    // Non-blocking simulation
    this.simulate(bundleSubmission);

    const resolution = await bundleSubmission.wait();

    this._logger.info(`Bundle resolution: ${FlashbotsBundleResolution[resolution]}`);

    return resolution;
  }

  /**
   * Submit a transaction to flashbots with retries
   * @param unsigned An unsigned transaction
   * @param retries Number of times to retry submission (Default: 10)
   */
  public async submitToFlashbotsWithRetry(unsigned: UnsignedTransaction, retries = 10) {
    // https://github.com/tim-kos/node-retry/issues/84
    const forever = retries === Number.POSITIVE_INFINITY;

    try {
      await retry(
        async bail => {
          const resolution = await this.submitToFlashbots(unsigned);
          if (resolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            throw new Error('BlockPassedWithoutInclusion');
          }
          if (resolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
            return bail(new Error('AccountNonceTooHigh'));
          }
        },
        {
          factor: 1,
          minTimeout: 0,
          forever,
          ...(!forever ? { retries } : {}),
          onRetry: async ({ message }, attempt) => {
            this._logger.warn(`Error: ${message}. Resubmitting Flashbots bundle (${attempt})...`);
          },
        },
      );
      this._logger.info('Bundle included!');
    } catch ({ message }) {
      this._logger.error(`Failed to submit Flashbots bundle with error: ${message}.`);
    }
  }

  /**
   * Simulate a Flashbots bundle and log results
   * @param bundleSubmission The submitted bundle
   */
  private async simulate(bundleSubmission: FlashbotsTransactionResponse) {
    try {
      const simulation = await bundleSubmission.simulate();
      if ('error' in simulation) {
        this._logger.warn(`Simulation Error: ${simulation.error.message}`);
      } else {
        this._logger.info(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`);
      }
    } catch ({ message }) {
      this._logger.warn(`Simulation Failed: ${message}`);
    }
  }
}
