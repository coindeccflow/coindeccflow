// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CoindeccFlowEscrow as Escrow} from "../CoindeccFlowEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract EscrowHandler is Test {
    Escrow public escrow;
    MockUSDC public usdc;
    address public payer = address(0xA11CE);
    address public recipient = address(0xB0B);
    uint256 public ghostFunded;
    uint256 public ghostReleased;

    constructor(Escrow e, MockUSDC u) {
        escrow = e;
        usdc = u;
        vm.prank(payer);
        u.approve(address(e), type(uint256).max);
    }

    function create(uint256 a, uint256 b) external {
        a = bound(a, 1, 1_000e6);
        b = bound(b, 1, 1_000e6);
        string[] memory t = new string[](2);
        string[] memory d = new string[](2);
        uint256[] memory amts = new uint256[](2);
        t[0] = "a";
        t[1] = "b";
        amts[0] = a;
        amts[1] = b;
        vm.prank(payer);
        escrow.createAgreement(recipient, "T", t, d, amts);
    }

    function fund(uint256 idSeed) external {
        uint256 n = escrow.agreementCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        if (ag.status != Escrow.AgreementStatus.Created) return;
        usdc.mint(payer, ag.totalAmount);
        vm.prank(payer);
        escrow.fundAgreement(id);
        ghostFunded += ag.totalAmount;
    }

    function approve(uint256 idSeed, uint256 idx) external {
        uint256 n = escrow.agreementCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        idx = bound(idx, 0, 1);
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        if (ag.status != Escrow.AgreementStatus.Funded) return;
        if (escrow.getMilestones(id)[idx].approved) return;
        vm.prank(payer);
        escrow.approveMilestone(id, idx);
    }

    function release(uint256 idSeed, uint256 idx, bool byPayer) external {
        uint256 n = escrow.agreementCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        idx = bound(idx, 0, 1);
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        if (ag.status != Escrow.AgreementStatus.Funded) return;
        Escrow.Milestone memory m = escrow.getMilestones(id)[idx];
        if (!m.approved || m.released) return;
        vm.prank(byPayer ? payer : recipient);
        escrow.releaseMilestone(id, idx);
        ghostReleased += m.amount;
    }
}

contract CoindeccFlowEscrowInvariantTest is Test {
    Escrow internal escrow;
    MockUSDC internal usdc;
    EscrowHandler internal handler;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new Escrow(address(usdc));
        handler = new EscrowHandler(escrow, usdc);
        targetContract(address(handler));
    }

    /// Contract token balance == sum of per-agreement balances == funded - released.
    function invariant_TokenBalanceEqualsSumOfAgreementBalances() public view {
        uint256 sum;
        uint256 n = escrow.agreementCount();
        for (uint256 id = 1; id <= n; ++id) {
            sum += escrow.getAgreementBalance(id);
        }
        assertEq(usdc.balanceOf(address(escrow)), sum);
        assertEq(sum, handler.ghostFunded() - handler.ghostReleased());
    }

    /// Recipient never receives more than was released through the escrow.
    function invariant_RecipientReceivedEqualsReleased() public view {
        assertEq(usdc.balanceOf(handler.recipient()), handler.ghostReleased());
    }
}
