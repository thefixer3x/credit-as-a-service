// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ICreditAggregator
 * @dev Interface for the main credit aggregation contract
 */
interface ICreditAggregator {
    function requestCredit(
        uint256 amount,
        address collateral,
        uint256 collateralAmount,
        uint256 duration
    ) external returns (uint256 creditId);
    
    function repayCredit(uint256 creditId, uint256 amount) external;
    
    function liquidate(uint256 creditId) external;
    
    function getUserCredits(address user) external view returns (uint256[] memory);
}
