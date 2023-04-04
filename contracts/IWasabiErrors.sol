// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

/**
 * @dev Required interface for defining all the errors
 */

interface IWasabiErrors {

    /**
     * @dev Thrown when an order that has been filled or cancelled is being acted upon
     */
    error OrderFilledOrCancelled();

    /**
     * @dev Thrown when someone tries to make an unauthorized request
     */
    error Unauthorized();

    /**
     * @dev Thrown when a signature is invalid
     */
    error InvalidSignature();

    /**
     * @dev Thrown when there is no sufficient available liquidity left in the pool for issuing a PUT option
     */
    error InsufficientAvailableLiquidity();

    /**
     * @dev Thrown when the requested NFT for a CALL is already locked for another option
     */
    error RequestNftIsLocked();

    /**
     * @dev Thrown when the NFT is not in the pool or invalid
     */
    error NftIsInvalid();

    /**
     * @dev Thrown when the expiry of an ask is invalid for the pool
     */
    error InvalidExpiry();

    /**
     * @dev Thrown when the strike price of an ask is invalid for the pool
     */
    error InvalidStrike();

    /**
     * @dev Thrown when the option type of an ask is invalid for the pool
     */
    error InvalidOptionType();

    /**
     * @dev Thrown when an expired order or option is being exercised
     */
    error HasExpired();
    
    /**
     * @dev Thrown when sending ETH failed
     */
    error FailedToSend();
}