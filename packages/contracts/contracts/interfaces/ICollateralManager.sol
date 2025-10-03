// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ICollateralManager
 * @dev Interface for collateral management functionality
 */
interface ICollateralManager {
    function depositCollateral(address token, uint256 amount) external;
    
    function withdrawCollateral(address token, uint256 amount) external;
    
    function lockCollateral(address user, address token, uint256 amount) external;
    
    function releaseCollateral(address user, address token, uint256 amount) external;
    
    function liquidateCollateral(
        address borrower,
        address token,
        uint256 amount,
        address liquidator
    ) external;
    
    function getCollateralValue(address user) external view returns (uint256);
    
    function getAvailableCollateral(address user, address token) external view returns (uint256);
}
