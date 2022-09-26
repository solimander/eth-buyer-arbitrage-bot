import { BigNumber as EthersBN, utils, constants } from 'ethers';
import { BN_18 } from '../config';

/**
 * Binary search to find optimal (most profitable) trade amount
 * @param left Lower bound
 * @param right Upper bound
 * @param prevout Previous output amount
 * @param calculateF Generic calculate function
 * @param tolerance Tolerable delta (in %, in 18 dec, i.e. parseUnits('0.01') means left and right delta can be 1%)
 */
export const binarySearch = async (
  left: EthersBN,
  right: EthersBN,
  prevout: EthersBN,
  calculateF: (val: EthersBN) => Promise<EthersBN>,
  tolerance = utils.parseUnits('0.01'),
): Promise<EthersBN> => {
  if (right.sub(left).gt(tolerance.mul(right.add(left).div(2)).div(BN_18))) {
    const mid = right.add(left).div(2);
    const out = await calculateF(mid);

    // Number go up
    if (out.gt(prevout)) {
      return binarySearch(mid, right, out, calculateF, tolerance);
    }

    // Number go down
    return binarySearch(left, mid, out, calculateF, tolerance);
  }

  // No negatives
  const ret = right.add(left).div(2);
  if (ret.lt(0)) {
    return constants.Zero;
  }
  return ret;
};
