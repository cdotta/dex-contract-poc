//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

contract Dai is ERC20 {
    constructor() ERC20('DAI', 'Dai Stablecoin') {}

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
