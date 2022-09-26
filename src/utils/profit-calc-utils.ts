import { BigNumber as EthersBN, utils, constants } from 'ethers';
import { BN_18 } from '../config';

/**
 * Binary search to find optimal (most profitable) trade amount
 * @param left Lower bound
 * @param right Upper bound
 * @param calculateF Generic calculate function
 * @param tolerance Tolerable delta (in %, in 18 dec, i.e. parseUnits('0.01') means left and right delta can be 1%)
 */
export const binarySearch = async (
  left: EthersBN,
  right: EthersBN,
  calculateF: (val: EthersBN) => Promise<EthersBN>,
  tolerance = utils.parseUnits('0.0001'),
): Promise<EthersBN> => {
  if (right.sub(left).gt(tolerance.mul(right.add(left).div(2)).div(BN_18))) {
    const mid = right.add(left).div(2);
    const double = mid.mul(2);
    const low = mid.div(2);
    const high = double.gt(right) ? right : double;

    const lowOut = await calculateF(low);
    const highOut = await calculateF(high);

    // Number go up
    if (highOut.gt(lowOut)) {
      return binarySearch(mid, right, calculateF, tolerance);
    }

    // Number go down
    return binarySearch(left, mid, calculateF, tolerance);
  }

  // No negatives
  const ret = right.add(left).div(2);
  if (ret.lt(0)) {
    return constants.Zero;
  }
  return ret;
};
