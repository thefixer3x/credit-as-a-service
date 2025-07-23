// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ICreditScoringOracle
 * @dev Interface for credit scoring and metrics tracking
 */
interface ICreditScoringOracle {
    struct CreditData {
        uint256 score;           // 0-1000 scale
        uint256 totalBorrowed;
        uint256 totalRepaid;
        uint256 defaultCount;
        uint256 onTimePayments;
        uint256 utilizationRate;
        uint256 lastUpdateBlock;
    }
    
    enum CreditUpdateType {
        OnTimePayment,
        LatePayment,
        Default,
        NewBorrow,
        Repayment
    }
    
    function getCreditData(address user) external view returns (CreditData memory);
    
    function updateCreditMetrics(
        address user, 
        CreditUpdateType updateType, 
        uint256 value
    ) external;
    
    function calculateCreditScore(address user) external view returns (uint256);
}
