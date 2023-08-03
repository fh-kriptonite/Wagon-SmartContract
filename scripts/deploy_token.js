require("ethers");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const wagon = await ethers.deployContract("Wagon");

  console.log("Wagon contract deployed at address:", await wagon.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });