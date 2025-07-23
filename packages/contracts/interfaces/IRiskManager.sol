// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IRiskManager
 * @dev Interface for risk management functionality
 */
interface IRiskManager {
    function getMinimumCreditScore() external view returns (uint256);
    
    function calculateRiskScore(address user, uint256 amount) external view returns (uint256);
    
    function isLoanApproved(address user, uint256 amount, uint256 creditScore) external view returns (bool);
}
