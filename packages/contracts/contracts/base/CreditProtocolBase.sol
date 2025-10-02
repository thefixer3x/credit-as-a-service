// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CreditProtocolBase
 * @dev Base contract with common functionality for all protocol contracts
 */
abstract contract CreditProtocolBase is Ownable, Pausable, ReentrancyGuard {
    
    constructor(address _owner) Ownable(_owner) {}
    
    mapping(address => bool) public authorizedContracts;
    
    event AuthorizedContractAdded(address indexed contractAddress);
    event AuthorizedContractRemoved(address indexed contractAddress);
    
    modifier onlyAuthorized() {
        require(
            authorizedContracts[msg.sender] || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }
    
    /**
     * @dev Add an authorized contract that can call restricted functions
     */
    function addAuthorizedContract(address contractAddress) external onlyOwner {
        require(contractAddress != address(0), "Invalid address");
        authorizedContracts[contractAddress] = true;
        emit AuthorizedContractAdded(contractAddress);
    }
    
    /**
     * @dev Remove an authorized contract
     */
    function removeAuthorizedContract(address contractAddress) external onlyOwner {
        authorizedContracts[contractAddress] = false;
        emit AuthorizedContractRemoved(contractAddress);
    }
    
    /**
     * @dev Pause the contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Check if an address is authorized
     */
    function isAuthorized(address account) external view returns (bool) {
        return authorizedContracts[account] || account == owner();
    }
}
