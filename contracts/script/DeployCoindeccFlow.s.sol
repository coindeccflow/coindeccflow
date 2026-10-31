// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CoindeccFlowEscrow} from "../CoindeccFlowEscrow.sol";

/// @notice Deploys CoindeccFlowEscrow against the USDC ERC-20 given in USDC_ADDRESS.
/// @dev The deployer has no special rights: the contract has no owner or admin.
///      Sign with a Foundry keystore (`--account`), never a raw private key flag.
contract DeployCoindeccFlow is Script {
    function run() external returns (CoindeccFlowEscrow escrow) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        vm.startBroadcast();
        escrow = new CoindeccFlowEscrow(usdc);
        vm.stopBroadcast();
        console.log("CoindeccFlowEscrow deployed at", address(escrow));
        console.log("USDC decimals", escrow.usdcDecimals());
    }
}
