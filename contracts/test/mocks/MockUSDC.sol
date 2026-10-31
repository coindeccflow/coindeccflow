// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Standard 6-decimal mock USDC.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Fee-on-transfer token: burns 1% of every wallet-to-wallet transfer.
contract FeeOnTransferUSDC is MockUSDC {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev Malicious token: on the first real transfer after `arm`, it calls `target`
/// with `payload` (re-entering the escrow), records the outcome, then continues.
contract ReentrantUSDC is MockUSDC {
    address public target;
    bytes public payload;
    bool public armed;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (armed && from != address(0) && to != address(0)) {
            armed = false;
            attempted = true;
            (bool ok, bytes memory data) = target.call(payload);
            reentrySucceeded = ok;
            reentryRevertData = data;
        }
        super._update(from, to, value);
    }
}
