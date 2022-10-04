import { uniswapClient, poolTicksQuery } from '../config';
import { MixedRoute, V2Route, V3Route } from '@uniswap/smart-order-router';
import { asyncIterableToPromise } from './paginated-graphql-client';
import { Pool, Tick } from '@uniswap/v3-sdk';
import { TickInfo } from '../types';

/**
 * Populate the swap route with Uniswap V3 pool tick data if necessary.
 * This enables off-chain profit calculation.
 * @param route The swap route
 */
export const getPopulatedRoute = async (route: V2Route | V3Route | MixedRoute) => {
  const _route = route as MixedRoute;
  for (let i = 0; i < _route.pools?.length; i++) {
    let pool = _route.pools[i];
    if (!(pool instanceof Pool)) {
      continue;
    }

    const poolAddress = Pool.getAddress(pool.token0, pool.token1, pool.fee);
    const poolTicks = await asyncIterableToPromise(
      uniswapClient.paginate<TickInfo>(
        'ticks',
        {
          document: poolTicksQuery,
          variables: {
            pool: poolAddress.toLowerCase(),
          },
        },
        { factor: 1, retries: 3 },
      ),
    );
    const ticks = poolTicks
      .sort((a, b) => (Number(a.tickIdx) > Number(b.tickIdx) ? 1 : -1))
      .map(tick => new Tick({ ...tick, index: Number(tick.tickIdx) }));
    _route.pools[i] = new Pool(
      pool.token0,
      pool.token1,
      pool.fee,
      pool.sqrtRatioX96,
      pool.liquidity,
      pool.tickCurrent,
      ticks,
    );
  }
  return _route;
};
