// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPriceFeedAggregator
 * @dev Interface for price feed aggregation
 */
interface IPriceFeedAggregator {
    function getPrice(address token) external view returns (uint256);
    
    function getPriceWithTimestamp(address token) external view returns (uint256 price, uint256 timestamp);
    
    function isTokenSupported(address token) external view returns (bool);
}
