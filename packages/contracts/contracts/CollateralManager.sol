// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/IPriceFeedAggregator.sol";
import "./base/CreditProtocolBase.sol";

/**
 * @title CollateralManager
 * @dev Manages multi-token collateral with dynamic pricing and liquidation
 */
contract CollateralManager is CreditProtocolBase, ICollateralManager {
    using SafeERC20 for IERC20;
    
    struct CollateralInfo {
        address token;
        uint256 amount;
        uint256 lockedAmount;
        uint256 lastUpdateTime;
    }
    
    mapping(address => mapping(address => CollateralInfo)) public userCollateral;
    mapping(address => bool) public supportedCollateral;
    mapping(address => uint256) public collateralFactors; // LTV ratios (basis points)
    mapping(address => uint256) public liquidationThresholds;
    
    IPriceFeedAggregator public priceFeed;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500; // 5% bonus
    
    address[] private supportedTokensList;
    
    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event CollateralLocked(address indexed user, address indexed token, uint256 amount);
    event CollateralReleased(address indexed user, address indexed token, uint256 amount);
    event CollateralLiquidated(address indexed borrower, address indexed token, uint256 amount, address liquidator);
    event CollateralSwapped(address indexed user, address fromToken, address toToken, uint256 amountIn, uint256 amountOut);
    
    constructor(address _priceFeed, address _owner) CreditProtocolBase(_owner) {
        priceFeed = IPriceFeedAggregator(_priceFeed);
    }
    
    function depositCollateral(address token, uint256 amount) external override nonReentrant whenNotPaused {
        require(supportedCollateral[token], "Unsupported collateral");
        require(amount > 0, "Invalid amount");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        CollateralInfo storage info = userCollateral[msg.sender][token];
        info.token = token;
        info.amount += amount;
        info.lastUpdateTime = block.timestamp;
        
        emit CollateralDeposited(msg.sender, token, amount);
    }
    
    function withdrawCollateral(address token, uint256 amount) external override nonReentrant whenNotPaused {
        CollateralInfo storage info = userCollateral[msg.sender][token];
        require(info.amount >= amount, "Insufficient balance");
        require(info.amount - info.lockedAmount >= amount, "Amount locked");
        
        info.amount -= amount;
        info.lastUpdateTime = block.timestamp;
        
        IERC20(token).safeTransfer(msg.sender, amount);
        
        emit CollateralWithdrawn(msg.sender, token, amount);
    }
    
    function lockCollateral(address user, address token, uint256 amount) external override onlyAuthorized {
        CollateralInfo storage info = userCollateral[user][token];
        require(info.amount >= info.lockedAmount + amount, "Insufficient collateral");
        
        info.lockedAmount += amount;
        info.lastUpdateTime = block.timestamp;
        
        emit CollateralLocked(user, token, amount);
    }
    
    function releaseCollateral(address user, address token, uint256 amount) external override onlyAuthorized {
        CollateralInfo storage info = userCollateral[user][token];
        require(info.lockedAmount >= amount, "Invalid release amount");
        
        info.lockedAmount -= amount;
        info.lastUpdateTime = block.timestamp;
        
        emit CollateralReleased(user, token, amount);
    }
    
    function getCollateralValue(address user) external view override returns (uint256 totalValue) {
        for (uint256 i = 0; i < supportedTokensList.length; i++) {
            address token = supportedTokensList[i];
            CollateralInfo memory info = userCollateral[user][token];
            
            if (info.amount > 0) {
                uint256 price = priceFeed.getPrice(token);
                uint256 decimals = IERC20Metadata(token).decimals();
                uint256 tokenValue = (info.amount * price) / (10 ** decimals);
                totalValue += tokenValue;
            }
        }
    }
    
    function getAvailableCollateral(address user, address token) external view override returns (uint256) {
        CollateralInfo memory info = userCollateral[user][token];
        return info.amount - info.lockedAmount;
    }
    
    function getLockedCollateral(address user, address token) external view returns (uint256) {
        return userCollateral[user][token].lockedAmount;
    }
    
    function liquidateCollateral(
        address borrower,
        address token,
        uint256 amount,
        address liquidator
    ) external override onlyAuthorized {
        CollateralInfo storage info = userCollateral[borrower][token];
        require(info.lockedAmount >= amount, "Insufficient locked collateral");
        
        info.amount -= amount;
        info.lockedAmount -= amount;
        info.lastUpdateTime = block.timestamp;
        
        // Transfer collateral to liquidator with liquidation bonus
        uint256 liquidationBonus = (amount * LIQUIDATION_BONUS) / BASIS_POINTS;
        uint256 totalTransfer = amount + liquidationBonus;
        
        // Ensure we have enough balance for the bonus
        if (info.amount >= liquidationBonus) {
            info.amount -= liquidationBonus;
        } else {
            totalTransfer = amount + info.amount;
            info.amount = 0;
        }
        
        IERC20(token).safeTransfer(liquidator, totalTransfer);
        
        emit CollateralLiquidated(borrower, token, amount, liquidator);
    }
    
    function swapCollateral(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 minAmountOut
    ) external nonReentrant whenNotPaused {
        require(supportedCollateral[fromToken] && supportedCollateral[toToken], "Unsupported tokens");
        
        CollateralInfo storage fromInfo = userCollateral[msg.sender][fromToken];
        require(fromInfo.amount - fromInfo.lockedAmount >= amount, "Insufficient available collateral");
        
        // Execute swap through DEX integration
        uint256 amountOut = _executeSwap(fromToken, toToken, amount, minAmountOut);
        
        // Update collateral balances
        fromInfo.amount -= amount;
        userCollateral[msg.sender][toToken].amount += amountOut;
        
        fromInfo.lastUpdateTime = block.timestamp;
        userCollateral[msg.sender][toToken].lastUpdateTime = block.timestamp;
        
        emit CollateralSwapped(msg.sender, fromToken, toToken, amount, amountOut);
    }
    
    function _executeSwap(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Placeholder for DEX integration (Uniswap V3, etc.)
        // In production, this would integrate with a DEX router
        
        // For now, simulate swap using price feeds
        uint256 fromPrice = priceFeed.getPrice(fromToken);
        uint256 toPrice = priceFeed.getPrice(toToken);
        uint256 fromDecimals = IERC20Metadata(fromToken).decimals();
        uint256 toDecimals = IERC20Metadata(toToken).decimals();
        
        amountOut = (amount * fromPrice * (10 ** toDecimals)) / (toPrice * (10 ** fromDecimals));
        
        // Apply 0.3% swap fee
        amountOut = (amountOut * 9970) / 10000;
        
        require(amountOut >= minAmountOut, "Insufficient output amount");
        
        return amountOut;
    }
    
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokensList;
    }
    
    function getCollateralInfo(address user, address token) external view returns (CollateralInfo memory) {
        return userCollateral[user][token];
    }
    
    function calculateLiquidationValue(address user, address token) external view returns (uint256) {
        CollateralInfo memory info = userCollateral[user][token];
        uint256 price = priceFeed.getPrice(token);
        uint256 decimals = IERC20Metadata(token).decimals();
        
        uint256 baseValue = (info.lockedAmount * price) / (10 ** decimals);
        uint256 threshold = liquidationThresholds[token];
        
        return (baseValue * threshold) / BASIS_POINTS;
    }
    
    // Admin functions
    function addSupportedCollateral(
        address token,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external onlyOwner {
        require(!supportedCollateral[token], "Already supported");
        require(collateralFactor <= BASIS_POINTS, "Invalid collateral factor");
        require(liquidationThreshold <= BASIS_POINTS, "Invalid liquidation threshold");
        
        supportedCollateral[token] = true;
        collateralFactors[token] = collateralFactor;
        liquidationThresholds[token] = liquidationThreshold;
        supportedTokensList.push(token);
    }
    
    function removeSupportedCollateral(address token) external onlyOwner {
        require(supportedCollateral[token], "Not supported");
        
        supportedCollateral[token] = false;
        delete collateralFactors[token];
        delete liquidationThresholds[token];
        
        // Remove from array
        for (uint256 i = 0; i < supportedTokensList.length; i++) {
            if (supportedTokensList[i] == token) {
                supportedTokensList[i] = supportedTokensList[supportedTokensList.length - 1];
                supportedTokensList.pop();
                break;
            }
        }
    }
    
    function updateCollateralFactor(address token, uint256 newFactor) external onlyOwner {
        require(supportedCollateral[token], "Not supported");
        require(newFactor <= BASIS_POINTS, "Invalid factor");
        collateralFactors[token] = newFactor;
    }
    
    function updateLiquidationThreshold(address token, uint256 newThreshold) external onlyOwner {
        require(supportedCollateral[token], "Not supported");
        require(newThreshold <= BASIS_POINTS, "Invalid threshold");
        liquidationThresholds[token] = newThreshold;
    }
    
    function updatePriceFeed(address _priceFeed) external onlyOwner {
        priceFeed = IPriceFeedAggregator(_priceFeed);
    }
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
