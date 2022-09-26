// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.15;

interface ITokenBuyer {
    /// @notice Buy ETH from this contract in exchange for `paymentToken` tokens.
    /// The price is determined using `priceFeed` plus `botDiscountBPs`
    /// Immediately invokes `payer` to pay back outstanding debt
    /// @dev First sends ETH by calling a callback, and then checks it received tokens.
    /// This allowed the caller to swap the ETH for tokens instead of holding tokens in advance
    /// @param tokenAmount the amount of ERC20 tokens msg.sender wishes to sell to this contract in exchange for ETH
    /// @param to the address to send ETH to by calling the callback function on it
    /// @param data arbitrary data passed through by the caller, usually used for callback verification
    function buyETH(
        uint256 tokenAmount,
        address to,
        bytes calldata data
    ) external;
}
