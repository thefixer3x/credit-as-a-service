// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/ICreditScoringOracle.sol";

/**
 * @title CreditScoringOracle
 * @dev Advanced credit scoring system with comprehensive metrics tracking
 */
contract CreditScoringOracle is ICreditScoringOracle, Ownable, Pausable {
    
    mapping(address => CreditData) public creditHistory;
    mapping(address => bool) public authorizedUpdaters;
    mapping(address => uint256) public userFirstBorrowTime;
    mapping(address => uint256) public userTotalCreditLimit;
    
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant MIN_SCORE = 100;
    uint256 public constant INITIAL_SCORE = 500;
    
    // Scoring weights (basis points)
    uint256 public constant PAYMENT_HISTORY_WEIGHT = 4000; // 40%
    uint256 public constant UTILIZATION_WEIGHT = 3000;     // 30%
    uint256 public constant HISTORY_LENGTH_WEIGHT = 1500;  // 15%
    uint256 public constant CREDIT_MIX_WEIGHT = 1000;      // 10%
    uint256 public constant DEFAULT_PENALTY_WEIGHT = 500;  // 5%
    
    event CreditScoreUpdated(address indexed user, uint256 oldScore, uint256 newScore);
    event CreditMetricsUpdated(address indexed user, CreditUpdateType updateType, uint256 value);
    event AuthorizedUpdaterAdded(address indexed updater);
    event AuthorizedUpdaterRemoved(address indexed updater);
    
    modifier onlyAuthorizedUpdater() {
        require(authorizedUpdaters[msg.sender], "Not authorized");
        _;
    }
    
    constructor() {
        // Initialize with contract deployer as authorized updater
        authorizedUpdaters[msg.sender] = true;
    }
    
    function getCreditData(address user) external view override returns (CreditData memory) {
        return creditHistory[user];
    }
    
    function updateCreditMetrics(
        address user,
        CreditUpdateType updateType,
        uint256 value
    ) external override onlyAuthorizedUpdater whenNotPaused {
        CreditData storage data = creditHistory[user];
        
        // Initialize if first interaction
        if (data.lastUpdateBlock == 0) {
            data.score = INITIAL_SCORE;
            userFirstBorrowTime[user] = block.timestamp;
        }
        
        uint256 oldScore = data.score;
        
        if (updateType == CreditUpdateType.OnTimePayment) {
            data.onTimePayments++;
            data.totalRepaid += value;
            _increaseScore(data, 10); // +10 points for on-time payment
        } else if (updateType == CreditUpdateType.LatePayment) {
            data.totalRepaid += value;
            _decreaseScore(data, 20); // -20 points for late payment
        } else if (updateType == CreditUpdateType.Default) {
            data.defaultCount++;
            _decreaseScore(data, 100); // -100 points for default
        } else if (updateType == CreditUpdateType.NewBorrow) {
            data.totalBorrowed += value;
            _updateUtilizationRate(user, data);
        } else if (updateType == CreditUpdateType.Repayment) {
            data.totalRepaid += value;
            _updateUtilizationRate(user, data);
        }
        
        data.lastUpdateBlock = block.number;
        
        // Recalculate comprehensive score
        data.score = calculateCreditScore(user);
        
        emit CreditMetricsUpdated(user, updateType, value);
        emit CreditScoreUpdated(user, oldScore, data.score);
    }
    
    function calculateCreditScore(address user) public view override returns (uint256) {
        CreditData memory data = creditHistory[user];
        
        if (data.lastUpdateBlock == 0) {
            return INITIAL_SCORE;
        }
        
        uint256 score = 0;
        
        // Payment history (40% weight)
        score += _calculatePaymentHistoryScore(data);
        
        // Credit utilization (30% weight)
        score += _calculateUtilizationScore(data);
        
        // Credit history length (15% weight)
        score += _calculateHistoryLengthScore(user);
        
        // Credit mix/amount (10% weight)
        score += _calculateCreditMixScore(data);
        
        // Apply default penalty (5% weight)
        score = _applyDefaultPenalty(data, score);
        
        // Ensure score is within bounds
        if (score > MAX_SCORE) score = MAX_SCORE;
        if (score < MIN_SCORE) score = MIN_SCORE;
        
        return score;
    }
    
    function _calculatePaymentHistoryScore(CreditData memory data) internal pure returns (uint256) {
        if (data.onTimePayments + data.defaultCount == 0) {
            return (INITIAL_SCORE * PAYMENT_HISTORY_WEIGHT) / 10000;
        }
        
        uint256 totalPayments = data.onTimePayments + data.defaultCount;
        uint256 paymentRatio = (data.onTimePayments * 100) / totalPayments;
        
        return (paymentRatio * PAYMENT_HISTORY_WEIGHT) / 100;
    }
    
    function _calculateUtilizationScore(CreditData memory data) internal pure returns (uint256) {
        if (data.utilizationRate <= 30) {
            return UTILIZATION_WEIGHT; // Full points for low utilization
        } else if (data.utilizationRate <= 70) {
            uint256 penalty = ((data.utilizationRate - 30) * UTILIZATION_WEIGHT) / 40;
            return UTILIZATION_WEIGHT - penalty;
        }
        return 0; // No points for high utilization
    }
    
    function _calculateHistoryLengthScore(address user) internal view returns (uint256) {
        if (userFirstBorrowTime[user] == 0) {
            return 0;
        }
        
        uint256 historyMonths = (block.timestamp - userFirstBorrowTime[user]) / 30 days;
        if (historyMonths == 0) {
            return 0;
        }
        
        // Maximum score at 24 months
        uint256 historyScore = historyMonths > 24 ? HISTORY_LENGTH_WEIGHT : (historyMonths * HISTORY_LENGTH_WEIGHT) / 24;
        return historyScore;
    }
    
    function _calculateCreditMixScore(CreditData memory data) internal pure returns (uint256) {
        if (data.totalBorrowed == 0) {
            return 0;
        }
        
        // Rewards larger borrowers up to 100,000 tokens
        uint256 borrowScore = data.totalBorrowed > 100000e18 ? 
            CREDIT_MIX_WEIGHT : 
            (data.totalBorrowed * CREDIT_MIX_WEIGHT) / 100000e18;
        
        return borrowScore;
    }
    
    function _applyDefaultPenalty(CreditData memory data, uint256 currentScore) internal pure returns (uint256) {
        if (data.defaultCount == 0) {
            return currentScore;
        }
        
        uint256 defaultPenalty = data.defaultCount * (DEFAULT_PENALTY_WEIGHT / 10); // 50 points per default
        return currentScore > defaultPenalty ? currentScore - defaultPenalty : MIN_SCORE;
    }
    
    function _increaseScore(CreditData storage data, uint256 points) internal {
        data.score = data.score + points > MAX_SCORE ? MAX_SCORE : data.score + points;
    }
    
    function _decreaseScore(CreditData storage data, uint256 points) internal {
        data.score = data.score > points ? data.score - points : MIN_SCORE;
    }
    
    function _updateUtilizationRate(address user, CreditData storage data) internal {
        // Calculate current utilization based on active positions
        uint256 totalLimit = userTotalCreditLimit[user];
        if (totalLimit == 0) {
            data.utilizationRate = 0;
            return;
        }
        
        uint256 currentDebt = data.totalBorrowed - data.totalRepaid;
        data.utilizationRate = (currentDebt * 100) / totalLimit;
    }
    
    // View functions
    function getUserCreditSummary(address user) external view returns (
        uint256 score,
        uint256 totalBorrowed,
        uint256 totalRepaid,
        uint256 onTimePayments,
        uint256 defaultCount,
        uint256 utilizationRate,
        uint256 accountAge
    ) {
        CreditData memory data = creditHistory[user];
        uint256 accountAge = userFirstBorrowTime[user] > 0 ? 
            (block.timestamp - userFirstBorrowTime[user]) / 1 days : 0;
        
        return (
            data.score,
            data.totalBorrowed,
            data.totalRepaid,
            data.onTimePayments,
            data.defaultCount,
            data.utilizationRate,
            accountAge
        );
    }
    
    function getScoreBreakdown(address user) external view returns (
        uint256 paymentHistoryScore,
        uint256 utilizationScore,
        uint256 historyLengthScore,
        uint256 creditMixScore,
        uint256 totalScore
    ) {
        CreditData memory data = creditHistory[user];
        
        paymentHistoryScore = _calculatePaymentHistoryScore(data);
        utilizationScore = _calculateUtilizationScore(data);
        historyLengthScore = _calculateHistoryLengthScore(user);
        creditMixScore = _calculateCreditMixScore(data);
        totalScore = calculateCreditScore(user);
        
        return (paymentHistoryScore, utilizationScore, historyLengthScore, creditMixScore, totalScore);
    }
    
    function isEligibleForCredit(address user, uint256 minimumScore) external view returns (bool) {
        return calculateCreditScore(user) >= minimumScore;
    }
    
    // Admin functions
    function addAuthorizedUpdater(address updater) external onlyOwner {
        require(updater != address(0), "Invalid address");
        authorizedUpdaters[updater] = true;
        emit AuthorizedUpdaterAdded(updater);
    }
    
    function removeAuthorizedUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = false;
        emit AuthorizedUpdaterRemoved(updater);
    }
    
    function setCreditLimit(address user, uint256 limit) external onlyAuthorizedUpdater {
        userTotalCreditLimit[user] = limit;
    }
    
    function batchUpdateScores(address[] calldata users) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            uint256 oldScore = creditHistory[users[i]].score;
            uint256 newScore = calculateCreditScore(users[i]);
            creditHistory[users[i]].score = newScore;
            emit CreditScoreUpdated(users[i], oldScore, newScore);
        }
    }
    
    function initializeUser(
        address user,
        uint256 initialScore,
        uint256 totalBorrowed,
        uint256 totalRepaid,
        uint256 onTimePayments,
        uint256 defaultCount
    ) external onlyOwner {
        require(creditHistory[user].lastUpdateBlock == 0, "User already initialized");
        
        creditHistory[user] = CreditData({
            score: initialScore,
            totalBorrowed: totalBorrowed,
            totalRepaid: totalRepaid,
            defaultCount: defaultCount,
            onTimePayments: onTimePayments,
            utilizationRate: 0,
            lastUpdateBlock: block.number
        });
        
        userFirstBorrowTime[user] = block.timestamp;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function emergencyResetScore(address user, uint256 newScore) external onlyOwner {
        require(newScore >= MIN_SCORE && newScore <= MAX_SCORE, "Invalid score");
        uint256 oldScore = creditHistory[user].score;
        creditHistory[user].score = newScore;
        emit CreditScoreUpdated(user, oldScore, newScore);
    }
}
