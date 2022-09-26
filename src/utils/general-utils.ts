/**
 * Delay execution for `seconds` seconds
 * @param seconds The number of seconds to delay
 */
export const delay = (seconds: number) =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000));
