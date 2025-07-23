const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Credit-as-a-Service Platform deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const deploymentData = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Deploy Price Feed Aggregator (Mock for testing)
  console.log("\n📊 Deploying PriceFeedAggregator...");
  const PriceFeedAggregator = await ethers.getContractFactory("MockPriceFeedAggregator");
  const priceFeedAggregator = await PriceFeedAggregator.deploy();
  await priceFeedAggregator.deployed();
  console.log("✅ PriceFeedAggregator deployed to:", priceFeedAggregator.address);
  deploymentData.contracts.priceFeedAggregator = priceFeedAggregator.address;

  // Deploy Credit Scoring Oracle
  console.log("\n🎯 Deploying CreditScoringOracle...");
  const CreditScoringOracle = await ethers.getContractFactory("CreditScoringOracle");
  const creditScoringOracle = await upgrades.deployProxy(
    CreditScoringOracle,
    [],
    { initializer: false }
  );
  await creditScoringOracle.deployed();
  console.log("✅ CreditScoringOracle deployed to:", creditScoringOracle.address);
  deploymentData.contracts.creditScoringOracle = creditScoringOracle.address;

  // Deploy Collateral Manager
  console.log("\n🏦 Deploying CollateralManager...");
  const CollateralManager = await ethers.getContractFactory("CollateralManager");
  const collateralManager = await upgrades.deployProxy(
    CollateralManager,
    [priceFeedAggregator.address],
    { initializer: "initialize" }
  );
  await collateralManager.deployed();
  console.log("✅ CollateralManager deployed to:", collateralManager.address);
  deploymentData.contracts.collateralManager = collateralManager.address;

  // Deploy Risk Manager (Mock for testing)
  console.log("\n⚠️ Deploying RiskManager...");
  const RiskManager = await ethers.getContractFactory("MockRiskManager");
  const riskManager = await RiskManager.deploy();
  await riskManager.deployed();
  console.log("✅ RiskManager deployed to:", riskManager.address);
  deploymentData.contracts.riskManager = riskManager.address;

  // Deploy Credit Aggregator
  console.log("\n🎯 Deploying CreditAggregator...");
  const CreditAggregator = await ethers.getContractFactory("CreditAggregator");
  const creditAggregator = await upgrades.deployProxy(
    CreditAggregator,
    [
      collateralManager.address,
      creditScoringOracle.address,
      riskManager.address
    ],
    { initializer: "initialize" }
  );
  await creditAggregator.deployed();
  console.log("✅ CreditAggregator deployed to:", creditAggregator.address);
  deploymentData.contracts.creditAggregator = creditAggregator.address;

  // Setup contract permissions
  console.log("\n🔐 Setting up contract permissions...");
  
  // Authorize CreditAggregator to update credit scores
  await creditScoringOracle.addAuthorizedUpdater(creditAggregator.address);
  console.log("✅ CreditAggregator authorized to update credit scores");

  // Authorize CreditAggregator to manage collateral
  await collateralManager.addAuthorizedContract(creditAggregator.address);
  console.log("✅ CreditAggregator authorized to manage collateral");

  // Add some supported collateral tokens (for testing)
  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    console.log("\n🪙 Adding supported collateral tokens...");
    
    // Deploy mock tokens for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    
    const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await weth.deployed();
    
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.deployed();
    
    const wbtc = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8);
    await wbtc.deployed();

    // Add to collateral manager
    await collateralManager.addSupportedCollateral(weth.address, 8000, 8500); // 80% LTV, 85% liquidation
    await collateralManager.addSupportedCollateral(usdc.address, 9000, 9500); // 90% LTV, 95% liquidation
    await collateralManager.addSupportedCollateral(wbtc.address, 7500, 8000); // 75% LTV, 80% liquidation

    // Set prices in mock price feed
    await priceFeedAggregator.setPrice(weth.address, ethers.utils.parseEther("2000")); // $2000
    await priceFeedAggregator.setPrice(usdc.address, ethers.utils.parseUnits("1", 6)); // $1
    await priceFeedAggregator.setPrice(wbtc.address, ethers.utils.parseUnits("30000", 8)); // $30000

    deploymentData.contracts.mockTokens = {
      weth: weth.address,
      usdc: usdc.address,
      wbtc: wbtc.address
    };

    console.log("✅ Mock tokens deployed and configured");
  }

  // Save deployment data
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📄 Deployment data saved to:", deploymentFile);
  
  console.log("\n📋 Contract Addresses:");
  console.log("├── CreditAggregator:", creditAggregator.address);
  console.log("├── CollateralManager:", collateralManager.address);
  console.log("├── CreditScoringOracle:", creditScoringOracle.address);
  console.log("├── RiskManager:", riskManager.address);
  console.log("└── PriceFeedAggregator:", priceFeedAggregator.address);

  if (deploymentData.contracts.mockTokens) {
    console.log("\n🪙 Mock Tokens:");
    console.log("├── WETH:", deploymentData.contracts.mockTokens.weth);
    console.log("├── USDC:", deploymentData.contracts.mockTokens.usdc);
    console.log("└── WBTC:", deploymentData.contracts.mockTokens.wbtc);
  }

  console.log("\n🔗 Next Steps:");
  console.log("1. Verify contracts on Etherscan (if on testnet/mainnet)");
  console.log("2. Set up monitoring and alerting");
  console.log("3. Configure frontend with contract addresses");
  console.log("4. Run integration tests");

  return deploymentData;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
