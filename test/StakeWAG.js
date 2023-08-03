const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Stake", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployStakingFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, user1, user2] = await ethers.getSigners();

    const Wagon = await ethers.getContractFactory("Wagon");
    const wagon = await Wagon.deploy();

    const wagonAddress = await wagon.getAddress();

    const Stake = await ethers.getContractFactory("StakingWAG");
    const stake = await upgrades.deployProxy(Stake, [wagonAddress, wagonAddress]);
    await stake.waitForDeployment();

    const stakeAddress = await stake.getAddress();

    // sent wagon to users
    await wagon.connect(owner).transfer(user1.address, "200000000000000000000"); // 200 WAG
    await wagon.connect(owner).transfer(user2.address, "200000000000000000000"); // 200 WAG
    await wagon.connect(owner).transfer(stakeAddress, "400000000000000000000"); // 400 WAG for reward

    const monthDuration = 60*60*24*30;
    await stake.connect(owner).setClaimDuration(monthDuration);

    return { stake, wagon, owner, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should distribute WAG token to users", async function () {
      const { stake, wagon, owner, user1, user2 } = await loadFixture(deployStakingFixture);

      const stakeAddress = await stake.getAddress();

      expect(await wagon.balanceOf(owner.address)).to.equal("99999200000000000000000000"); // 200 WAG
      expect(await wagon.balanceOf(user1.address)).to.equal("200000000000000000000"); // 200 WAG
      expect(await wagon.balanceOf(user2.address)).to.equal("200000000000000000000"); // 200 WAG
      expect(await wagon.balanceOf(stakeAddress)).to.equal("400000000000000000000"); // 400 WAG
    });

    it("Should set the right stake token and reward token", async function () {
      const { stake, wagon } = await loadFixture(deployStakingFixture);

      const wagonAddress = await wagon.getAddress();
      const stakingToken = (await stake.stakingToken());
      const rewardsToken = (await stake.rewardsToken());

      expect(await stakingToken).to.equal(wagonAddress);
      expect(await rewardsToken).to.equal(wagonAddress);
    });
  });

// ------------------------------------------------------------------------------------------------------------------------ //

  async function StakeFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(deployStakingFixture);

    const stakeAddress = await stake.getAddress();

    // user1 stake 100 
    await wagon.connect(user1).approve(stakeAddress, "100000000000000000000");
    await stake.connect(user1).stake("100000000000000000000");

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }

  describe("Staking", function () {
    it("Should have success stake", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(StakeFixture);

      expect(await stake.balanceOf(user1.address)).to.equal("100000000000000000000");
    });
    
    it("Pause, Should have fail stake", async function () {
      const { owner, stake, wagon, user1, user2 } = await loadFixture(StakeFixture);

      await stake.connect(owner).pause();
      
      const stakeAddress = await stake.getAddress();
      
      await wagon.connect(user1).approve(stakeAddress, "100000000000000000000");

      await expect(stake.connect(user1).stake("100000000000000000000")).to.be.revertedWith(
        "Pausable: paused"
      );
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------ //

  async function InjectRewardPrestartFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(StakeFixture);

    const duration = 100;

    await stake.addRewardCycle("200000000000000000000", duration);

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }


  describe("Before reward start", function () {
    it("User1 should have 0 reward before reward start counting", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardPrestartFixture);

      expect(await stake.earned(user1.address)).to.equal(0);
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------ //

    async function InjectRewardFixture() {
      const { stake, wagon, owner, user1, user2 } = await loadFixture(InjectRewardPrestartFixture);

      // await ethers.provider.send('evm_increaseTime', [49]);
      // await ethers.provider.send('evm_mine');
      
      // stake wagon
      return { stake, wagon, owner, user1, user2 };
    }

    describe("Reward start", function () {
      it("User1 should have 0 reward", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        expect(await stake.earned(user1.address)).to.equal(0);
      });

      it("User1 should have 10 rewards after 5 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        await ethers.provider.send('evm_increaseTime', [5]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("10000000000000000000");
      });

      it("User1 should have 200 rewards after 100 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        await ethers.provider.send('evm_increaseTime', [100]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("200000000000000000000");
      });

      it("User1 transfer all at 50 sec, user1 and user2 should have 100 rewards after 100 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        await ethers.provider.send('evm_increaseTime', [49]);
        await ethers.provider.send('evm_mine');

        await stake.connect(user1).transfer(user2.address, "100000000000000000000");

        await ethers.provider.send('evm_increaseTime', [50]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("100000000000000000000");
        expect(await stake.earned(user2.address)).to.equal("100000000000000000000");
      });

      it("User1 transfer half at 50 sec, user1 and user2 should have 100 rewards after 100 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        await ethers.provider.send('evm_increaseTime', [49]);
        await ethers.provider.send('evm_mine');

        await stake.connect(user1).transfer(user2.address, "50000000000000000000");

        await ethers.provider.send('evm_increaseTime', [50]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("150000000000000000000");
        expect(await stake.earned(user2.address)).to.equal("50000000000000000000");
      });

      it("User1 should have 200 rewards after 200 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        await ethers.provider.send('evm_increaseTime', [200]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("200000000000000000000");
      });

      it("User2 stake 100 in at 50 second and should have 50 rewards after 100 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        const stakeAddress = await stake.getAddress();

        await ethers.provider.send('evm_increaseTime', [48]);
        await ethers.provider.send('evm_mine');

        await wagon.connect(user2).approve(stakeAddress, "100000000000000000000");
        await stake.connect(user2).stake("100000000000000000000");

        await ethers.provider.send('evm_increaseTime', [50]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("150000000000000000000");
        expect(await stake.earned(user2.address)).to.equal("50000000000000000000");
      });

      it("User2 stake 100 at 50 second and should have 50 rewards after 200 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        const stakeAddress = await stake.getAddress();

        await ethers.provider.send('evm_increaseTime', [48]);
        await ethers.provider.send('evm_mine');

        await wagon.connect(user2).approve(stakeAddress, "100000000000000000000");
        await stake.connect(user2).stake("100000000000000000000");

        await ethers.provider.send('evm_increaseTime', [150]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("150000000000000000000");
        expect(await stake.earned(user2.address)).to.equal("50000000000000000000");
      });

      it("User2 stake 100 at 50 second, user 1 unstake 100 at 75 second and get correct rewards at 100 seconds", async function () {
        const { stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);

        const stakeAddress = await stake.getAddress();

        await ethers.provider.send('evm_increaseTime', [48]);
        await ethers.provider.send('evm_mine');

        await wagon.connect(user2).approve(stakeAddress, "100000000000000000000");
        await stake.connect(user2).stake("100000000000000000000");

        await ethers.provider.send('evm_increaseTime', [24]);
        await ethers.provider.send('evm_mine');

        expect(await stake.earned(user1.address)).to.equal("124000000000000000000");

        await stake.connect(user1).unstake("100000000000000000000");
        expect(await wagon.balanceOf(user1.address)).to.equal("100000000000000000000");

        await expect(stake.connect(user1).withdraw()).to.be.revertedWith(
          "Not yet claimable"
        );

        const monthDuration = 60*60*24*30;
        await ethers.provider.send('evm_increaseTime', [monthDuration]);
        await ethers.provider.send('evm_mine');

        await expect(stake.connect(user2).withdraw()).to.be.revertedWith(
          "Not enough balance to be claim"
        );

        await stake.connect(user1).withdraw();

        expect(await stake.earned(user1.address)).to.equal("125000000000000000000");
        expect(await stake.earned(user2.address)).to.equal("75000000000000000000");
        expect(await wagon.balanceOf(user1.address)).to.equal("200000000000000000000");
        
      });

      it("Pause, Should have fail unstake", async function () {
        const { owner, stake, wagon, user1, user2 } = await loadFixture(InjectRewardFixture);
  
        await stake.connect(owner).pause();
        
        await expect(stake.connect(user1).unstake("100000000000000000000")).to.be.revertedWith(
          "Pausable: paused"
        );
      });

    });

  // ------------------------------------------------------------------------------------------------------------------------ //

  async function GetRewardFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(InjectRewardFixture);

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }

  describe("Get Reward", function () {
    it("Should have success claim reward after 100 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(GetRewardFixture);
      
      await ethers.provider.send('evm_increaseTime', [100]);
      await ethers.provider.send('evm_mine');

      await stake.connect(user1).getReward();

      expect(await wagon.balanceOf(user1.address)).to.equal("300000000000000000000");
      expect(await stake.earned(user1.address)).to.equal("0");
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------ //

  async function AddRewardCycleFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(InjectRewardFixture);

    await ethers.provider.send('evm_increaseTime', [99]);
    await ethers.provider.send('evm_mine');

    const duration = 100;

    await stake.addRewardCycle("100000000000000000000", duration);

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }

  describe("Add second reward cycle", function () {
    it("Should have 200 earned", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardCycleFixture);
      
      expect(await stake.earned(user1.address)).to.equal("200000000000000000000");
    });

    it("Should have 300 earned at 200 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardCycleFixture);
      
      await ethers.provider.send('evm_increaseTime', [100]);
      await ethers.provider.send('evm_mine');

      expect(await stake.earned(user1.address)).to.equal("300000000000000000000");
    });

    it("User 2 stake 100 at 150 seconds, Should have 25 earned at 200 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardCycleFixture);
      
      const stakeAddress = await stake.getAddress();

      await ethers.provider.send('evm_increaseTime', [48]);
      await ethers.provider.send('evm_mine');

      // user2 stake 100 
      await wagon.connect(user2).approve(stakeAddress, "100000000000000000000");
      await stake.connect(user2).stake("100000000000000000000");

      await ethers.provider.send('evm_increaseTime', [50]);
      await ethers.provider.send('evm_mine');

      expect(await stake.earned(user1.address)).to.equal("275000000000000000000");
      expect(await stake.earned(user2.address)).to.equal("25000000000000000000");
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------ //

  async function AddRewardAmountFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(AddRewardCycleFixture);

    await ethers.provider.send('evm_increaseTime', [49]);
    await ethers.provider.send('evm_mine');

    await stake.addRewardAmount("50000000000000000000");

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }

  describe("Add reward amound at second cycle", function () {
    it("Should have 250 earned", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardAmountFixture);
      
      expect(await stake.earned(user1.address)).to.equal("250000000000000000000");
    });

    it("Should have 350 earned at 200 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardAmountFixture);
      
      await ethers.provider.send('evm_increaseTime', [50]);
      await ethers.provider.send('evm_mine');

      expect(await stake.earned(user1.address)).to.equal("350000000000000000000");
    });

    it("User 2 stake 100 at 150 second, should have 300 earned at 200 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardAmountFixture);
      
      const stakeAddress = await stake.getAddress();

      // user2 stake 100 
      await wagon.connect(user2).approve(stakeAddress, "100000000000000000000");
      await stake.connect(user2).stake("100000000000000000000");

      await ethers.provider.send('evm_increaseTime', [48]);
      await ethers.provider.send('evm_mine');

      expect(await stake.earned(user1.address)).to.equal("302000000000000000000");
      expect(await stake.earned(user2.address)).to.equal("48000000000000000000");
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------ //

  async function AddRewardAmountAfterFinishFixture() {
    const { stake, wagon, owner, user1, user2 } = await loadFixture(AddRewardAmountFixture);

    await ethers.provider.send('evm_increaseTime', [49]);
    await ethers.provider.send('evm_mine');

    await stake.setRewardsDuration(100);
    await stake.addRewardAmount("50000000000000000000");

    // stake wagon
    return { stake, wagon, owner, user1, user2 };
  }

  describe("Add reward amound at second cycle", function () {
    it("Should have 350 earned", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardAmountAfterFinishFixture);
      
      expect(await stake.earned(user1.address)).to.equal("350000000000000000000");
    });

    it("Should have 400 earned at 300 seconds", async function () {
      const { stake, wagon, user1, user2 } = await loadFixture(AddRewardAmountAfterFinishFixture);
      
      await ethers.provider.send('evm_increaseTime', [100]);
      await ethers.provider.send('evm_mine');

      expect(await stake.earned(user1.address)).to.equal("400000000000000000000");
    });
  });

});
