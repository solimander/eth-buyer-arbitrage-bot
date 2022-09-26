import {
  CONTRACT_ADDRESSES,
  logger,
  BN_36,
  BN_0,
  tokenBuyer,
  router,
  usdc,
  eth,
  swapConfig,
  flashbots,
  signer,
  OPTIMAL_PRICE_ROUNDING_MARGIN,
  OPPORTUNITY_CHECK_INTERVAL_SEC,
  UNISWAP_V3_SWAP_ROUTER_ADDRESS,
} from './config';
import { CurrencyAmount, TradeType } from '@uniswap/sdk-core';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BigNumber as EthersBN, utils } from 'ethers';
import { binarySearch, delay, getPopulatedRoute } from './utils';
import { Trade } from '@uniswap/router-sdk';
import { tryF, isError } from 'ts-try';

const { ArbitrageBot } = CONTRACT_ADDRESSES;

const run = async () => {
  const tokenBuyerState = await tryF<[EthersBN, EthersBN]>(async () =>
    tokenBuyer.tokenAmountNeededAndETHPayout(),
  );

  if (isError(tokenBuyerState)) {
    logger.info('Price feed is stale. Skipping execution.');
    return;
  }

  const [usdcNeeded, ethOffered] = tokenBuyerState;
  if (ethOffered.eq(0)) {
    logger.info(
      `Token buyer contract has no ETH balance. Checking again in ${OPPORTUNITY_CHECK_INTERVAL_SEC} seconds.`,
    );
    await delay(OPPORTUNITY_CHECK_INTERVAL_SEC);
    run();
    return;
  }
  if (usdcNeeded.eq(0)) {
    logger.info(
      `Token buyer contract does not need any USDC. Checking again in ${OPPORTUNITY_CHECK_INTERVAL_SEC} seconds.`,
    );
    await delay(OPPORTUNITY_CHECK_INTERVAL_SEC);
    run();
    return;
  }
  logger.info(
    `Token buyer contract is offering ${utils.formatEther(ethOffered)} ETH for ${utils.formatUnits(
      usdcNeeded,
      usdc.decimals,
    )} USDC.`,
  );

  const price = usdcNeeded.mul(BN_36).div(ethOffered).div(usdc.decimals);

  // Fetch swap route with best available price
  const usdcOutputAmount = CurrencyAmount.fromRawAmount(usdc, usdcNeeded.toString());
  const swapRoute = await router.route(usdcOutputAmount, eth, TradeType.EXACT_OUTPUT, swapConfig);
  if (!swapRoute?.trade || !swapRoute?.route?.length) {
    logger.info('Could not find a trade route. Skipping execution.');
    return;
  }

  // Populate the route with tick data, if necessary
  const route = await getPopulatedRoute(swapRoute.route[0].route);

  const calcProfit = async (amountOut: EthersBN) => {
    const usdcOut = CurrencyAmount.fromRawAmount(usdc, amountOut.toString());
    const trade = await Trade.fromRoute(route, usdcOut, TradeType.EXACT_OUTPUT);
    const requiredEthIn = EthersBN.from(usdcOut.quotient.toString())
      .mul(BN_36)
      .div(price)
      .div(usdc.decimals);

    return EthersBN.from(trade.inputAmount.quotient.toString()).sub(requiredEthIn);
  };

  // Determine the most profitable output amount
  let optimalUSDCOut = await binarySearch(BN_0, usdcNeeded, BN_0, calcProfit);
  if (usdcNeeded.sub(optimalUSDCOut).lt(OPTIMAL_PRICE_ROUNDING_MARGIN)) {
    optimalUSDCOut = usdcNeeded; // Arb the full amount needed if the estimate is close enough
  }
  logger.info(`Optimal USDC output amount: ${utils.formatUnits(optimalUSDCOut, usdc.decimals)}`);

  const optimalPriceRoute = await router.route(
    CurrencyAmount.fromRawAmount(usdc, optimalUSDCOut.toString()),
    eth,
    TradeType.EXACT_OUTPUT,
    swapConfig,
  );
  const ethOfferedByTokenBuyer = optimalUSDCOut.mul(BN_36).div(price).div(usdc.decimals);
  const ethRequiredForTrade = EthersBN.from(
    optimalPriceRoute?.trade.inputAmount.quotient.toString(),
  );
  const profitBeforeGasCosts = ethOfferedByTokenBuyer.sub(ethRequiredForTrade);

  // Skip execution if the gas cost is greater than the profit
  if (optimalPriceRoute?.estimatedGasUsedQuoteToken.greaterThan(profitBeforeGasCosts.toString())) {
    const offered = utils.formatEther(ethOfferedByTokenBuyer);
    const required = utils.formatEther(ethRequiredForTrade);
    const gasCost = optimalPriceRoute?.estimatedGasUsedQuoteToken.toExact();
    logger.info(
      `Arbitrage is not profitable. ETH offered by TokenBuyer: ${offered}. ETH required for trade: ${required}. Gas Cost: ${gasCost}. Skipping execution.`,
    );
    return;
  }
  if (!optimalPriceRoute?.methodParameters?.calldata) {
    logger.info(`No Route Calldata. Skipping execution.`);
    return;
  }
  logger.info(
    `Arbitrage is profitable. Expected Profit: ${utils.formatEther(
      profitBeforeGasCosts.sub(optimalPriceRoute.estimatedGasUsedQuoteToken.quotient.toString()),
    )} ETH. Executing...`,
  );

  const data = utils.defaultAbiCoder.encode(
    ['address', 'bytes', 'uint256', 'uint256'],
    [
      UNISWAP_V3_SWAP_ROUTER_ADDRESS,
      optimalPriceRoute.methodParameters.calldata,
      optimalPriceRoute.estimatedGasUsedQuoteToken.quotient.toString(),
      0, // No need to bribe (yet)
    ],
  );

  const gasEstimate = await tryF(async () =>
    tokenBuyer.estimateGas['buyETH(uint256,address,bytes)'](
      optimalUSDCOut,
      ArbitrageBot.address,
      data,
    ),
  );
  if (isError(gasEstimate)) {
    logger.warn(`Arbitrage gas estimate failed with error: ${gasEstimate.message}`);
    return;
  }

  const transaction: TransactionRequest = {
    to: tokenBuyer.address,
    from: signer.address,
    gasLimit: gasEstimate,
    gasPrice: optimalPriceRoute.gasPriceWei,
    nonce: await signer.getTransactionCount('latest'),
    data: tokenBuyer.interface.encodeFunctionData('buyETH(uint256,address,bytes)', [
      optimalUSDCOut,
      ArbitrageBot.address,
      data,
    ]),
  };
  const result = await tryF(async () =>
    flashbots.submitToFlashbotsWithRetry(
      {
        signer,
        transaction,
      },
      3,
    ),
  );
  if (isError(result)) {
    logger.warn(
      `Arbitrage failed with error: ${result.message}. Retrying in ${OPPORTUNITY_CHECK_INTERVAL_SEC} seconds.`,
    );
    await delay(OPPORTUNITY_CHECK_INTERVAL_SEC);
  }
  run();
};
run();
