// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

// @title: Wagon Network Token
// @author: wagon.network
// @website: https://wagon.network
// @telegram: https://t.me/wagon_network

// ██╗    ██╗ █████╗  ██████╗  ██████╗ ███╗   ██╗
// ██║    ██║██╔══██╗██╔════╝ ██╔═══██╗████╗  ██║
// ██║ █╗ ██║███████║██║  ███╗██║   ██║██╔██╗ ██║
// ██║███╗██║██╔══██║██║   ██║██║   ██║██║╚██╗██║
// ╚███╔███╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║
//  ╚══╝╚══╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Staking is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    // Create a new role identifier for the distributor role
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    // Create a new role identifier for the admin role
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20 public stakingToken;
    IERC20 public rewardsToken;

    // Value that indicate that it is the first cycle
    bool isFirstCycle;
    // Duration of rewards to be paid out (in seconds)
    uint public duration;
    // Timestamp of when the rewards finish
    uint public finishAt;
    // Minimum of last updated time and reward finish time
    uint public startAt;
    // Reward to be paid out per second
    uint public rewardRate;
    // Sum of (reward rate * dt * 1e18 / total supply)
    uint public rewardPerTokenStored;
    // User address => rewardPerTokenStored
    mapping(address => uint) public userRewardPerTokenPaid;
    // User address => rewards to be claimed
    mapping(address => uint) public rewards;
    // Total staked
    uint public totalSupply;
    // User address => staked amount
    mapping(address => uint) public balanceOf;
    // Duration of rewards to be able to claim;
    uint public claimableDuration;
    // Claimbale status
    struct claimable {
        uint startTime;
        uint claimableTime;
        uint amount;
    }
    // User address => claimables status
    mapping(address => claimable) public claimables;
    // Total claimable
    uint public totalClaimable;
    // total rewards claimed
    uint public totalRewardClaimed;
    // User address => total rewards claimed
    mapping(address => uint) public userTotalRewardClaimed;

    event Stake(address indexed _from, uint indexed _amount); 
    event SetClaimDuration(address indexed _from, uint indexed _duration);
    event Unstake(address indexed _from, uint indexed _amount, uint _claimableTime);
    event Withdraw(address indexed _from, uint _amount);
    event GetReward(address indexed _from, uint _amount);
    event SetRewardsDuration(address indexed _from, uint _duration);
    event InitialRewardCycle(address indexed _from, uint _amount, uint _startAt, uint _finishAt);
    event AddRewardCycle(address indexed _from, uint _amount, uint _startAt, uint _finishAt);
    event AddRewardAmount(address indexed _from, uint _amount, uint _startAt, uint _finishAt);

    function initialize(address _stakingToken, address _rewardToken) public initializer {
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardToken);
        
        // Grant the role to a specified account
        _grantRole(DISTRIBUTOR_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function pause() public onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    modifier updateReward(address _account) {
        rewardPerTokenStored = rewardPerToken();
        startAt = lastTimeRewardApplicable();

        if (_account != address(0)) {
            rewards[_account] = earned(_account);
            userRewardPerTokenPaid[_account] = rewardPerTokenStored;
        }

        _;
    }

    function lastTimeRewardApplicable() public view returns (uint) {
        return _min(finishAt, block.timestamp);
    }

    function rewardPerToken() public view returns (uint) {
        if (totalSupply == 0) {
            return rewardPerTokenStored;
        }

        if(block.timestamp <= startAt && isFirstCycle) return 0;

        return
            rewardPerTokenStored +
            (rewardRate * (lastTimeRewardApplicable() - startAt) * 1e18) /
            totalSupply;
    }

    function stake(uint _amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(_amount > 0, "amount = 0");
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        balanceOf[msg.sender] += _amount;
        totalSupply += _amount;

        emit Stake(msg.sender, _amount);
    }

    function setClaimDuration(uint _duration) external nonReentrant onlyRole(ADMIN_ROLE){
        require(_duration >= 0, "Claim reward duration must be greater equal than 0.");
        claimableDuration = _duration;

        emit SetClaimDuration(msg.sender, _duration);
    }

    function unstake(uint _amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(_amount > 0, "amount = 0");
        require(balanceOf[msg.sender] >= _amount, "Not enough balance to be unstake");
        balanceOf[msg.sender] -= _amount;
        totalSupply -= _amount;

        uint claimableTime = block.timestamp + claimableDuration;

        if(claimableDuration > 0) {
            claimables[msg.sender].startTime = block.timestamp;
            claimables[msg.sender].claimableTime = claimableTime;
            claimables[msg.sender].amount += _amount;

            totalClaimable += _amount;
        } else {
            stakingToken.transfer(msg.sender, _amount);
        }

        emit Unstake(msg.sender, _amount, claimableTime);
    }

    function withdraw() external nonReentrant whenNotPaused {
        require(claimables[msg.sender].claimableTime <= block.timestamp, "Not yet claimable");
        require(claimables[msg.sender].amount > 0, "Not enough balance to be claim");
        
        uint _amount = claimables[msg.sender].amount;
        claimables[msg.sender].amount = 0;
        totalClaimable -= _amount;
        
        stakingToken.transfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _amount);
    }

    function earned(address _account) public view returns (uint) {
        if(block.timestamp <= startAt && isFirstCycle) return 0;

        return
            ((balanceOf[_account] *
                (rewardPerToken() - userRewardPerTokenPaid[_account])) / 1e18) +
            rewards[_account];
    }

    function getReward() external nonReentrant whenNotPaused updateReward(msg.sender) {
        uint reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.transfer(msg.sender, reward);
            totalRewardClaimed += reward;
            userTotalRewardClaimed[msg.sender] += reward;
        }

        emit GetReward(msg.sender, reward);
    }

    function setRewardsDuration(uint _duration) external nonReentrant onlyRole(ADMIN_ROLE) {
        require(_duration > 0, "Reward duration must be greater than 0.");
        duration = _duration;

        emit SetRewardsDuration(msg.sender, _duration);
    }

    function initialRewardCycle(
        uint _amount, uint _startAt, uint _finishAt
    ) external nonReentrant onlyRole(ADMIN_ROLE) updateReward(address(0)) {
        isFirstCycle = true;
        updateRewardRate(_amount, _startAt, _finishAt);

        emit InitialRewardCycle(msg.sender, _amount, _startAt, _finishAt);
    }

    function addRewardCycle(
        uint _amount, uint _finishAt
    ) external nonReentrant onlyRole(ADMIN_ROLE) updateReward(address(0)) {
        if(isFirstCycle) isFirstCycle = false;
        updateRewardRate(_amount, block.timestamp, _finishAt);

        emit AddRewardCycle(msg.sender, _amount, block.timestamp, _finishAt);
    }

    function addRewardAmount(
        uint _amount
    ) external nonReentrant onlyRole(DISTRIBUTOR_ROLE) updateReward(address(0)) {
        uint _finishAt;
        if(block.timestamp >= finishAt) {
            _finishAt = block.timestamp + duration;
        } else {
            _finishAt = finishAt;
        }

        updateRewardRate(_amount, block.timestamp, _finishAt);
        
        emit AddRewardAmount(msg.sender, _amount, block.timestamp, _finishAt);
    }

    function updateRewardRate(
        uint _amount, uint _startAt, uint _finishAt
    ) internal {
        require(_startAt < _finishAt, "_startAt >= _finishAt");
        uint _duration = _finishAt - _startAt;

        if (block.timestamp >= finishAt) {
            rewardRate = _amount / _duration;
        } else {
            uint remainingRewards = (finishAt - block.timestamp) * rewardRate;
            rewardRate = (_amount + remainingRewards) / _duration;
        }

        require(rewardRate > 0, "reward rate = 0");
        require(
            rewardRate * _duration <= rewardsToken.balanceOf(address(this)),
            "reward amount > balance"
        );

        finishAt = _finishAt;
        startAt = _startAt;
    }

    function _min(uint x, uint y) private pure returns (uint) {
        return x <= y ? x : y;
    }
}

interface IERC20 {
    function totalSupply() external view returns (uint);

    function balanceOf(address account) external view returns (uint);

    function transfer(address recipient, uint amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint amount
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed owner, address indexed spender, uint value);
}
