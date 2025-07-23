// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ICreditAggregator.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/ICreditScoringOracle.sol";
import "./interfaces/IRiskManager.sol";
import "./base/CreditProtocolBase.sol";

/**
 * @title CreditAggregator
 * @dev Main contract for aggregating credit offers and managing credit lifecycle
 */
contract CreditAggregator is CreditProtocolBase, ICreditAggregator {
    
    struct CreditPosition {
        address borrower;
        uint256 principal;
        uint256 interestRate;
        uint256 collateralAmount;
        address collateralToken;
        uint256 startTime;
        uint256 duration;
        CreditStatus status;
        address lendingProtocol;
    }
    
    enum CreditStatus {
        Active,
        Repaid,
        Defaulted,
        Liquidated
    }
    
    mapping(uint256 => CreditPosition) public creditPositions;
    mapping(address => uint256[]) public userCredits;
    mapping(address => uint256) public protocolWeights;
    
    uint256 private _creditIdCounter;
    ICollateralManager public collateralManager;
    ICreditScoringOracle public creditScoringOracle;
    IRiskManager public riskManager;
    
    event CreditRequested(uint256 indexed creditId, address indexed borrower, uint256 amount);
    event CreditRepaid(uint256 indexed creditId, uint256 amount);
    event CreditLiquidated(uint256 indexed creditId, address indexed liquidator);
    
    constructor(
        address _collateralManager,
        address _creditScoringOracle,
        address _riskManager
    ) {
        collateralManager = ICollateralManager(_collateralManager);
        creditScoringOracle = ICreditScoringOracle(_creditScoringOracle);
        riskManager = IRiskManager(_riskManager);
    }
    
    function requestCredit(
        uint256 amount,
        address collateral,
        uint256 collateralAmount,
        uint256 duration
    ) external override nonReentrant whenNotPaused returns (uint256 creditId) {
        require(amount > 0, "Invalid amount");
        require(duration > 0, "Invalid duration");
        
        // Verify credit score and risk assessment
        uint256 creditScore = creditScoringOracle.calculateCreditScore(msg.sender);
        require(creditScore >= riskManager.getMinimumCreditScore(), "Insufficient credit score");
        
        // Lock collateral
        collateralManager.lockCollateral(msg.sender, collateral, collateralAmount);
        
        // Find optimal lending protocol
        address optimalProtocol = _findOptimalProtocol(amount, duration);
        uint256 interestRate = _calculateInterestRate(msg.sender, amount, creditScore);
        
        creditId = ++_creditIdCounter;
        
        creditPositions[creditId] = CreditPosition({
            borrower: msg.sender,
            principal: amount,
            interestRate: interestRate,
            collateralAmount: collateralAmount,
            collateralToken: collateral,
            startTime: block.timestamp,
            duration: duration,
            status: CreditStatus.Active,
            lendingProtocol: optimalProtocol
        });
        
        userCredits[msg.sender].push(creditId);
        
        emit CreditRequested(creditId, msg.sender, amount);
        
        return creditId;
    }
    
    function repayCredit(uint256 creditId, uint256 amount) external override nonReentrant {
        CreditPosition storage position = creditPositions[creditId];
        require(position.borrower == msg.sender, "Not borrower");
        require(position.status == CreditStatus.Active, "Credit not active");
        
        uint256 totalOwed = _calculateTotalOwed(creditId);
        require(amount >= totalOwed, "Insufficient repayment amount");
        
        // Process repayment
        position.status = CreditStatus.Repaid;
        
        // Release collateral
        collateralManager.releaseCollateral(
            msg.sender, 
            position.collateralToken, 
            position.collateralAmount
        );
        
        // Update credit score
        creditScoringOracle.updateCreditMetrics(
            msg.sender, 
            ICreditScoringOracle.CreditUpdateType.OnTimePayment, 
            amount
        );
        
        emit CreditRepaid(creditId, amount);
    }
    
    function liquidate(uint256 creditId) external override nonReentrant {
        CreditPosition storage position = creditPositions[creditId];
        require(position.status == CreditStatus.Active, "Credit not active");
        require(_isLiquidatable(creditId), "Position not liquidatable");
        
        position.status = CreditStatus.Liquidated;
        
        // Execute liquidation through collateral manager
        collateralManager.liquidateCollateral(
            position.borrower,
            position.collateralToken,
            position.collateralAmount,
            msg.sender
        );
        
        // Update credit score negatively
        creditScoringOracle.updateCreditMetrics(
            position.borrower,
            ICreditScoringOracle.CreditUpdateType.Default,
            position.principal
        );
        
        emit CreditLiquidated(creditId, msg.sender);
    }
    
    function getUserCredits(address user) external view returns (uint256[] memory) {
        return userCredits[user];
    }
    
    function getCreditPosition(uint256 creditId) external view returns (CreditPosition memory) {
        return creditPositions[creditId];
    }
    
    function _findOptimalProtocol(uint256 amount, uint256 duration) internal view returns (address) {
        // Implementation for finding optimal lending protocol
        // Based on interest rates, liquidity, and protocol weights
        // This would integrate with protocol adapters
        return address(0); // Placeholder
    }
    
    function _calculateInterestRate(address borrower, uint256 amount, uint256 creditScore) internal view returns (uint256) {
        // Dynamic interest rate calculation based on credit score and market conditions
        // Base rate + risk premium based on credit score
        uint256 baseRate = 500; // 5% in basis points
        uint256 riskPremium = creditScore > 700 ? 0 : (700 - creditScore) * 10; // Additional risk
        return baseRate + riskPremium;
    }
    
    function _calculateTotalOwed(uint256 creditId) internal view returns (uint256) {
        CreditPosition memory position = creditPositions[creditId];
        uint256 timeElapsed = block.timestamp - position.startTime;
        uint256 interest = (position.principal * position.interestRate * timeElapsed) / (365 days * 10000);
        return position.principal + interest;
    }
    
    function _isLiquidatable(uint256 creditId) internal view returns (bool) {
        CreditPosition memory position = creditPositions[creditId];
        
        // Check if loan is overdue
        bool isOverdue = block.timestamp > position.startTime + position.duration;
        
        // Check collateral ratio
        uint256 collateralValue = collateralManager.getCollateralValue(position.borrower);
        uint256 totalOwed = _calculateTotalOwed(creditId);
        uint256 collateralRatio = (collateralValue * 10000) / totalOwed;
        
        // Liquidatable if overdue or under-collateralized
        return isOverdue || collateralRatio < 12000; // 120% threshold
    }
    
    // Admin functions
    function setProtocolWeight(address protocol, uint256 weight) external onlyOwner {
        protocolWeights[protocol] = weight;
    }
    
    function updateCollateralManager(address _collateralManager) external onlyOwner {
        collateralManager = ICollateralManager(_collateralManager);
    }
    
    function updateCreditScoringOracle(address _creditScoringOracle) external onlyOwner {
        creditScoringOracle = ICreditScoringOracle(_creditScoringOracle);
    }
    
    function updateRiskManager(address _riskManager) external onlyOwner {
        riskManager = IRiskManager(_riskManager);
    }
}
