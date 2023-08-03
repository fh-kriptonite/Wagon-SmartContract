require("ethers");
require("@openzeppelin/hardhat-upgrades");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  wagonAddress = "0xd486698B9e3100Aaf9022C192BC343256CdA1541"
  const Stake = await ethers.getContractFactory("StakingWAG");
  const stake = await upgrades.deployProxy(Stake, [wagonAddress, wagonAddress]);
  await stake.waitForDeployment();

  console.log("Wagon Staking contract deployed at address:", await stake.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });