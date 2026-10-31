// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdError, console2} from "forge-std/Test.sol";
import {CoindeccFlowEscrow as Escrow} from "../CoindeccFlowEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {BlocklistUSDC, AttackerHandler} from "./mocks/AdversarialMocks.sol";

contract CoindeccFlowEscrowAdversarialTest is Test {
    Escrow internal escrow;
    BlocklistUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal recipient = makeAddr("recipient");
    address internal other = makeAddr("other");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        usdc = new BlocklistUSDC();
        escrow = new Escrow(address(usdc));
        usdc.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ───────────────────────────── helpers ─────────────────────────────

    function _amts(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _amts(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    function _amts(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory r) {
        r = new uint256[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    function _strs(uint256 n) internal pure returns (string[] memory s) {
        s = new string[](n);
        for (uint256 i; i < n; ++i) s[i] = "m";
    }

    function _createData(address rec, uint256[] memory amts) internal pure returns (bytes memory) {
        return abi.encodeCall(
            Escrow.createAgreement, (rec, "T", _strs(amts.length), new string[](amts.length), amts)
        );
    }

    function _create(address rec, uint256[] memory amts) internal returns (uint256 id) {
        vm.prank(payer);
        id = escrow.createAgreement(rec, "T", _strs(amts.length), new string[](amts.length), amts);
    }

    function _fund(uint256 id) internal {
        vm.prank(payer);
        escrow.fundAgreement(id);
    }

    function _approve(uint256 id, uint256 i) internal {
        vm.prank(payer);
        escrow.approveMilestone(id, i);
    }

    function _release(address by, uint256 id, uint256 i) internal {
        vm.prank(by);
        escrow.releaseMilestone(id, i);
    }

    function _call(address from, uint256 value, bytes memory data) internal returns (bool ok) {
        vm.deal(from, value);
        vm.prank(from);
        (ok,) = address(escrow).call{value: value}(data);
    }

    function _badStatus(Escrow.AgreementStatus actual, Escrow.AgreementStatus expected)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(Escrow.InvalidAgreementStatus.selector, actual, expected);
    }

    function _snap(uint256 id) internal view returns (bytes32) {
        return keccak256(abi.encode(escrow.getAgreement(id), escrow.getMilestones(id)));
    }

    function _assertPartiesFixed(uint256 id, address p, address r) internal view {
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        assertEq(ag.payer, p, "payer changed");
        assertEq(ag.recipient, r, "recipient changed");
    }

    /// Fire every mutating function (ids 0..3, idx 0..2) from `who`, ignoring reverts.
    function _attackAll(address who) internal {
        for (uint256 id; id <= 3; ++id) {
            _call(who, 0, abi.encodeCall(Escrow.fundAgreement, (id)));
            _call(who, 0, abi.encodeCall(Escrow.cancelAgreement, (id)));
            for (uint256 i; i <= 2; ++i) {
                _call(who, 0, abi.encodeCall(Escrow.approveMilestone, (id, i)));
                _call(who, 0, abi.encodeCall(Escrow.releaseMilestone, (id, i)));
            }
        }
        _call(who, 0, _createData(other, _amts(1)));
    }

    // ───────────────── (1) no native value accepted ─────────────────

    function test_RawNativeSendReverts() public {
        assertFalse(_call(attacker, 1 ether, ""), "receive() must not exist");
        assertFalse(_call(attacker, 1, hex"01"), "fallback must not exist");
        assertFalse(_call(attacker, 0, ""), "empty calldata must revert");
        assertEq(address(escrow).balance, 0);
    }

    function test_StateChangingFunctionsRejectValue() public {
        // Each value-bearing call reverts; the identical call without value then works,
        // proving the value (and nothing else) was the cause.
        assertFalse(_call(payer, 1, _createData(recipient, _amts(10e6, 5e6))));
        assertEq(escrow.agreementCount(), 0);
        assertTrue(_call(payer, 0, _createData(recipient, _amts(10e6, 5e6))));
        assertEq(escrow.agreementCount(), 1);

        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.fundAgreement, (1))));
        assertEq(uint8(escrow.getAgreement(1).status), uint8(Escrow.AgreementStatus.Created));
        assertTrue(_call(payer, 0, abi.encodeCall(Escrow.fundAgreement, (1))));

        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.approveMilestone, (1, 0))));
        assertFalse(escrow.getMilestones(1)[0].approved);
        assertTrue(_call(payer, 0, abi.encodeCall(Escrow.approveMilestone, (1, 0))));

        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.releaseMilestone, (1, 0))));
        assertFalse(_call(recipient, 1, abi.encodeCall(Escrow.releaseMilestone, (1, 0))));
        assertFalse(escrow.getMilestones(1)[0].released);
        assertTrue(_call(payer, 0, abi.encodeCall(Escrow.releaseMilestone, (1, 0))));

        uint256 id2 = _create(other, _amts(1e6));
        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.cancelAgreement, (id2))));
        assertEq(uint8(escrow.getAgreement(id2).status), uint8(Escrow.AgreementStatus.Created));
        assertTrue(_call(payer, 0, abi.encodeCall(Escrow.cancelAgreement, (id2))));

        assertEq(address(escrow).balance, 0, "escrow holds native value");
    }

    function test_ViewFunctionsRejectValue() public {
        _create(recipient, _amts(1e6));
        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.getAgreement, (1))));
        assertFalse(_call(payer, 1, abi.encodeCall(Escrow.agreementCount, ())));
        assertEq(address(escrow).balance, 0);
    }

    function test_UnknownSelectorsRevert() public {
        bytes4[5] memory sels = [
            bytes4(0xdeadbeef),
            bytes4(keccak256("withdraw(uint256)")),
            bytes4(keccak256("refund(uint256)")),
            bytes4(keccak256("rescueTokens(address,uint256)")),
            bytes4(keccak256("setRecipient(uint256,address)"))
        ];
        for (uint256 i; i < sels.length; ++i) {
            assertFalse(_call(payer, 0, abi.encodePacked(sels[i], uint256(1), uint256(2))));
            assertFalse(_call(payer, 1, abi.encodePacked(sels[i])));
        }
        assertFalse(_call(payer, 0, hex"aabbcc"), "short calldata must revert");
    }

    // ───────────────── (3) unpayable (blocklisted) recipient ─────────────────

    function test_BlocklistedRecipientReleaseRevertsAtomically() public {
        uint256 id1 = _create(recipient, _amts(100e6, 50e6));
        uint256 id2 = _create(other, _amts(70e6, 30e6));
        _fund(id1);
        _fund(id2);
        _approve(id1, 0);
        _approve(id2, 0);
        usdc.setBlocked(recipient, true);

        bytes32 snap1 = _snap(id1);
        uint256 escrowBal = usdc.balanceOf(address(escrow));
        assertEq(escrowBal, 250e6);

        // Neither the payer nor the (blocked) recipient can release.
        vm.expectRevert();
        _release(payer, id1, 0);
        vm.expectRevert();
        _release(recipient, id1, 0);

        Escrow.Agreement memory ag = escrow.getAgreement(id1);
        assertFalse(escrow.getMilestones(id1)[0].released, "milestone marked released");
        assertTrue(escrow.getMilestones(id1)[0].approved);
        assertEq(ag.releasedAmount, 0);
        assertEq(ag.releasedCount, 0);
        assertEq(uint8(ag.status), uint8(Escrow.AgreementStatus.Funded));
        assertEq(_snap(id1), snap1, "state changed by failed release");
        assertEq(usdc.balanceOf(address(escrow)), escrowBal);
        assertEq(usdc.balanceOf(recipient), 0);

        // Other agreements are unaffected.
        _release(payer, id2, 0);
        assertEq(usdc.balanceOf(other), 70e6);
        _approve(id2, 1);
        _release(other, id2, 1);
        assertEq(uint8(escrow.getAgreement(id2).status), uint8(Escrow.AgreementStatus.Completed));
        assertEq(usdc.balanceOf(address(escrow)), 150e6);
        assertEq(escrow.getAgreementBalance(id1), 150e6);
    }

    function test_BlocklistedRecipientFundsStayLocked() public {
        uint256 id1 = _create(recipient, _amts(100e6, 50e6));
        _fund(id1);
        _approve(id1, 0);
        usdc.setBlocked(recipient, true);

        // DOCUMENTED LIMITATION: no refund / cancel / rescue / re-route exists, so funds
        // of an agreement whose recipient is blocklisted stay locked in the escrow.
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Funded, Escrow.AgreementStatus.Created));
        vm.prank(payer);
        escrow.cancelAgreement(id1);
        vm.expectRevert();
        _release(payer, id1, 0);
        _approve(id1, 1);
        vm.expectRevert();
        _release(payer, id1, 1);
        assertFalse(_call(payer, 0, abi.encodeWithSignature("refund(uint256)", id1)));

        assertEq(usdc.balanceOf(address(escrow)), 150e6);
        assertEq(usdc.balanceOf(payer) + usdc.balanceOf(recipient), 1_000_000e6 - 150e6);
        _assertPartiesFixed(id1, payer, recipient);

        // Only an external unblock frees them; they still go to the original recipient.
        usdc.setBlocked(recipient, false);
        _release(payer, id1, 0);
        _release(payer, id1, 1);
        assertEq(usdc.balanceOf(recipient), 150e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_BlocklistedRecipientAfterPartialRelease() public {
        uint256 id = _create(recipient, _amts(60e6, 40e6));
        _fund(id);
        _approve(id, 0);
        _release(payer, id, 0);
        usdc.setBlocked(recipient, true);
        _approve(id, 1);
        vm.expectRevert();
        _release(recipient, id, 1);
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        assertEq(ag.releasedAmount, 60e6);
        assertEq(ag.releasedCount, 1);
        assertEq(uint8(ag.status), uint8(Escrow.AgreementStatus.Funded));
        assertFalse(escrow.getMilestones(id)[1].released);
        assertEq(escrow.getAgreementBalance(id), 40e6);
    }

    // ───────────────── (4) direct donation ─────────────────

    function test_DonationDoesNotAffectAccountingOrOtherFunding() public {
        uint256 id1 = _create(recipient, _amts(40e6, 60e6));
        uint256 id2 = _create(other, _amts(25e6, 75e6));
        _fund(id1);
        bytes32 s1 = _snap(id1);
        bytes32 s2 = _snap(id2);

        usdc.mint(attacker, 500e6);
        vm.prank(attacker);
        usdc.transfer(address(escrow), 500e6);

        assertEq(_snap(id1), s1, "agreement 1 accounting changed");
        assertEq(_snap(id2), s2, "agreement 2 accounting changed");
        assertEq(escrow.getAgreementBalance(id1), 100e6);
        assertEq(escrow.getAgreementBalance(id2), 0);
        assertEq(usdc.balanceOf(address(escrow)), 600e6);

        // Funding another agreement still works and its balance delta is exact.
        uint256 before = usdc.balanceOf(address(escrow));
        _fund(id2);
        assertEq(usdc.balanceOf(address(escrow)) - before, 100e6);
        assertEq(escrow.getAgreement(id2).fundedAmount, 100e6);

        // Complete both agreements; recipients get exactly their milestones.
        for (uint256 i; i < 2; ++i) {
            _approve(id1, i);
            _release(recipient, id1, i);
            _approve(id2, i);
            _release(other, id2, i);
        }
        assertEq(usdc.balanceOf(recipient), 100e6);
        assertEq(usdc.balanceOf(other), 100e6);
        // The donation is stranded: nobody can extract it.
        assertEq(usdc.balanceOf(address(escrow)), 500e6);
        uint256 attackerBal = usdc.balanceOf(attacker);
        _attackAll(attacker);
        _attackAll(payer);
        _attackAll(recipient);
        _attackAll(other);
        assertEq(usdc.balanceOf(address(escrow)), 500e6, "donation extracted");
        assertEq(usdc.balanceOf(attacker), attackerBal);
    }

    function testFuzz_DonationNeverBreaksAccounting(uint256 donation, uint256 amtA) public {
        donation = bound(donation, 1, 1e30);
        amtA = bound(amtA, 1, 1_000e6);
        uint256 id1 = _create(recipient, _amts(amtA));
        uint256 id2 = _create(other, _amts(7e6));
        usdc.mint(attacker, donation);
        vm.prank(attacker);
        usdc.transfer(address(escrow), donation);

        _fund(id1);
        _fund(id2);
        assertEq(escrow.getAgreementBalance(id1), amtA);
        assertEq(escrow.getAgreementBalance(id2), 7e6);
        assertEq(usdc.balanceOf(address(escrow)), donation + amtA + 7e6);
        _approve(id1, 0);
        _release(payer, id1, 0);
        assertEq(usdc.balanceOf(recipient), amtA);
        assertEq(usdc.balanceOf(address(escrow)), donation + 7e6);
        assertEq(escrow.getAgreementBalance(id1), 0);
    }

    // ───────────────── (5) cancel semantics ─────────────────

    function test_CancelledAgreementCannotBeFundedApprovedOrReleased() public {
        uint256 id1 = _create(recipient, _amts(10e6, 20e6));
        uint256 id2 = _create(recipient, _amts(5e6));
        vm.prank(payer);
        escrow.cancelAgreement(id1);
        assertEq(uint8(escrow.getAgreement(id1).status), uint8(Escrow.AgreementStatus.Cancelled));

        uint256 payerBal = usdc.balanceOf(payer);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Created));
        _fund(id1);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Funded));
        _approve(id1, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Funded));
        _release(payer, id1, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Funded));
        _release(recipient, id1, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Created));
        vm.prank(payer);
        escrow.cancelAgreement(id1);

        assertEq(usdc.balanceOf(payer), payerBal);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.getAgreement(id1).fundedAmount, 0);
        // Sibling agreement unaffected.
        _fund(id2);
        assertEq(escrow.getAgreementBalance(id2), 5e6);
    }

    function test_CancelByNonPayerReverts() public {
        uint256 id = _create(recipient, _amts(10e6));
        address[3] memory who = [recipient, attacker, other];
        for (uint256 i; i < who.length; ++i) {
            vm.expectRevert(Escrow.OnlyPayer.selector);
            vm.prank(who[i]);
            escrow.cancelAgreement(id);
        }
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Created));
    }

    function test_CancelAfterFundingOrCompletionReverts() public {
        uint256 id = _create(recipient, _amts(10e6));
        _fund(id);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Funded, Escrow.AgreementStatus.Created));
        vm.prank(payer);
        escrow.cancelAgreement(id);

        _approve(id, 0);
        _release(payer, id, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Completed, Escrow.AgreementStatus.Created));
        vm.prank(payer);
        escrow.cancelAgreement(id);
        assertEq(usdc.balanceOf(recipient), 10e6);
    }

    function test_CancelLeavesIdListsAndCountUnchanged() public {
        _create(recipient, _amts(1e6));
        uint256 id2 = _create(other, _amts(2e6));
        _create(recipient, _amts(3e6));
        bytes32 byPayer = keccak256(abi.encode(escrow.getAgreementIdsByPayer(payer)));
        bytes32 byRec = keccak256(abi.encode(escrow.getAgreementIdsByRecipient(other)));
        vm.prank(payer);
        escrow.cancelAgreement(id2);
        assertEq(keccak256(abi.encode(escrow.getAgreementIdsByPayer(payer))), byPayer);
        assertEq(keccak256(abi.encode(escrow.getAgreementIdsByRecipient(other))), byRec);
        assertEq(escrow.getAgreementIdsByPayer(payer).length, 3);
        assertEq(escrow.agreementCount(), 3);
        _assertPartiesFixed(id2, payer, other);
    }

    // ───────────────── (6) state machine ─────────────────

    function test_ApproveAfterCompletionReverts() public {
        uint256 id = _create(recipient, _amts(10e6, 5e6));
        _fund(id);
        for (uint256 i; i < 2; ++i) {
            _approve(id, i);
            _release(payer, id, i);
        }
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Completed, Escrow.AgreementStatus.Funded));
        _approve(id, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Completed, Escrow.AgreementStatus.Funded));
        _release(payer, id, 0);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Completed, Escrow.AgreementStatus.Created));
        _fund(id);
    }

    function test_ApproveAndReleaseOfReleasedMilestoneReverts() public {
        uint256 id = _create(recipient, _amts(10e6, 5e6));
        _fund(id);
        _approve(id, 0);
        _release(payer, id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneAlreadyApproved.selector, 0));
        _approve(id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneAlreadyReleased.selector, 0));
        _release(payer, id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneAlreadyReleased.selector, 0));
        _release(recipient, id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneNotApproved.selector, 1));
        _release(payer, id, 1);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneIndexOutOfRange.selector, 2));
        _approve(id, 2);
        assertEq(usdc.balanceOf(recipient), 10e6, "double payout");
    }

    function test_RecipientAndOutsidersCannotApprove() public {
        uint256 id = _create(recipient, _amts(10e6));
        _fund(id);
        address[3] memory who = [recipient, attacker, other];
        for (uint256 i; i < who.length; ++i) {
            vm.expectRevert(Escrow.OnlyPayer.selector);
            vm.prank(who[i]);
            escrow.approveMilestone(id, 0);
        }
        vm.expectRevert(Escrow.OnlyPayerOrRecipient.selector);
        _release(attacker, id, 0);
        assertFalse(escrow.getMilestones(id)[0].approved);
    }

    function test_FundByNonPayerAndDoubleFundReverts() public {
        uint256 id = _create(recipient, _amts(10e6));
        usdc.mint(recipient, 10e6);
        vm.prank(recipient);
        usdc.approve(address(escrow), type(uint256).max);
        vm.expectRevert(Escrow.OnlyPayer.selector);
        vm.prank(recipient);
        escrow.fundAgreement(id);
        _fund(id);
        vm.expectRevert(_badStatus(Escrow.AgreementStatus.Funded, Escrow.AgreementStatus.Created));
        _fund(id);
        assertEq(usdc.balanceOf(address(escrow)), 10e6);
    }

    function test_PartiesImmutableAcrossAllActions() public {
        uint256 id = _create(recipient, _amts(10e6, 20e6));
        _assertPartiesFixed(id, payer, recipient);
        // No re-route function exists: these selectors all revert and change nothing.
        assertFalse(_call(payer, 0, abi.encodeWithSignature("setRecipient(uint256,address)", id, other)));
        assertFalse(_call(payer, 0, abi.encodeWithSignature("changeRecipient(uint256,address)", id, other)));
        assertFalse(_call(payer, 0, abi.encodeWithSignature("transferPayer(uint256,address)", id, other)));
        _assertPartiesFixed(id, payer, recipient);

        _attackAll(attacker);
        _assertPartiesFixed(id, payer, recipient);
        _fund(id);
        _assertPartiesFixed(id, payer, recipient);
        _approve(id, 1);
        _assertPartiesFixed(id, payer, recipient);
        _release(recipient, id, 1);
        _assertPartiesFixed(id, payer, recipient);
        _approve(id, 0);
        _release(payer, id, 0);
        _assertPartiesFixed(id, payer, recipient);
        assertEq(usdc.balanceOf(recipient), 30e6);
        assertEq(usdc.balanceOf(other), 0);
        assertEq(escrow.getAgreementIdsByRecipient(recipient)[0], id);
        assertEq(escrow.getAgreementIdsByPayer(payer)[0], id);
    }

    // ───────────────── (7) release ordering ─────────────────

    function test_OutOfOrderApproveAndRelease() public {
        uint256 id = _create(recipient, _amts(10e6, 20e6, 30e6));
        _fund(id);
        _approve(id, 2);
        _approve(id, 0);
        _release(recipient, id, 2);
        assertEq(escrow.getAgreement(id).releasedAmount, 30e6);
        assertEq(usdc.balanceOf(recipient), 30e6);
        _approve(id, 1);
        _release(payer, id, 0);
        assertEq(escrow.getAgreement(id).releasedAmount, 40e6);
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Funded));
        _release(recipient, id, 1);

        Escrow.Agreement memory ag = escrow.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Escrow.AgreementStatus.Completed));
        assertEq(ag.releasedCount, 3);
        assertEq(ag.releasedAmount, ag.fundedAmount);
        assertEq(ag.fundedAmount, ag.totalAmount);
        assertEq(usdc.balanceOf(recipient), 60e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.getAgreementBalance(id), 0);
    }

    function _perm(uint256 seed, uint256 n) internal pure returns (uint256[] memory p) {
        p = new uint256[](n);
        for (uint256 i; i < n; ++i) p[i] = i;
        for (uint256 i = n - 1; i > 0; --i) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (p[i], p[j]) = (p[j], p[i]);
        }
    }

    function testFuzz_AnyOrderTotalPaidEqualsFunded(uint256 seedA, uint256 seedB, uint256 amtSeed) public {
        uint256 n = 5;
        uint256[] memory amts = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            amts[i] = bound(uint256(keccak256(abi.encode(amtSeed, i))), 1, 1_000e6);
            total += amts[i];
        }
        uint256 id = _create(recipient, amts);
        _fund(id);
        uint256[] memory approveOrder = _perm(seedA, n);
        uint256[] memory releaseOrder = _perm(seedB, n);
        for (uint256 i; i < n; ++i) _approve(id, approveOrder[i]);

        uint256 paid;
        for (uint256 i; i < n; ++i) {
            uint256 k = releaseOrder[i];
            _release(i % 2 == 0 ? payer : recipient, id, k);
            paid += amts[k];
            Escrow.Agreement memory mid = escrow.getAgreement(id);
            assertEq(mid.releasedAmount, paid);
            assertEq(usdc.balanceOf(recipient), paid);
            assertEq(usdc.balanceOf(address(escrow)), total - paid);
            if (i + 1 < n) assertEq(uint8(mid.status), uint8(Escrow.AgreementStatus.Funded));
        }
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Escrow.AgreementStatus.Completed));
        assertEq(usdc.balanceOf(recipient), ag.fundedAmount, "paid != funded");
        assertEq(ag.fundedAmount, total);
        assertEq(ag.totalAmount, total);
        assertEq(ag.releasedCount, n);
    }

    // ───────────────── (8) createAgreement overflow ─────────────────

    function test_CreateOverflowRevertsAndLeavesCountUnchanged() public {
        _create(recipient, _amts(1e6));
        assertEq(escrow.agreementCount(), 1);
        bytes32 byPayer = keccak256(abi.encode(escrow.getAgreementIdsByPayer(payer)));

        vm.expectRevert(stdError.arithmeticError);
        vm.prank(payer);
        escrow.createAgreement(
            other, "T", _strs(2), new string[](2), _amts(type(uint256).max, 1)
        );
        vm.expectRevert(stdError.arithmeticError);
        vm.prank(payer);
        escrow.createAgreement(
            other, "T", _strs(2), new string[](2), _amts(type(uint256).max / 2 + 1, type(uint256).max / 2 + 1)
        );
        vm.expectRevert(stdError.arithmeticError);
        vm.prank(payer);
        escrow.createAgreement(
            other, "T", _strs(3), new string[](3), _amts(1, 2, type(uint256).max - 2)
        );

        assertEq(escrow.agreementCount(), 1, "count bumped by reverted create");
        assertEq(keccak256(abi.encode(escrow.getAgreementIdsByPayer(payer))), byPayer);
        assertEq(escrow.getAgreementIdsByRecipient(other).length, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.AgreementNotFound.selector, 2));
        escrow.getAgreement(2);
        // The next successful create still gets id 2.
        assertEq(_create(other, _amts(1e6)), 2);
    }

    function testFuzz_CreateOverflowAlwaysReverts(uint256 a, uint256 b) public {
        a = bound(a, 1, type(uint256).max);
        b = bound(b, type(uint256).max - a + 1, type(uint256).max);
        vm.expectRevert(stdError.arithmeticError);
        vm.prank(payer);
        escrow.createAgreement(other, "T", _strs(2), new string[](2), _amts(a, b));
        assertEq(escrow.agreementCount(), 0);
    }
}

// ───────────────── (2) no unauthorized outflow: adversarial invariants ─────────────────

contract CoindeccFlowEscrowAdversarialInvariantTest is Test {
    Escrow internal escrow;
    MockUSDC internal usdc;
    AttackerHandler internal handler;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new Escrow(address(usdc));
        handler = new AttackerHandler(escrow, usdc);
        targetContract(address(handler));
    }

    /// The attacker is never a recipient: its balance can only go down.
    function invariant_AttackerBalanceNeverIncreases() public view {
        assertFalse(handler.attackerGained(), "attacker gained in a call");
        assertLe(usdc.balanceOf(handler.attacker()), handler.START());
    }

    /// Escrow always holds at least the sum of what agreements still owe.
    function invariant_EscrowSolvent() public view {
        uint256 sum;
        uint256 n = escrow.agreementCount();
        for (uint256 id = 1; id <= n; ++id) sum += escrow.getAgreementBalance(id);
        assertGe(usdc.balanceOf(address(escrow)), sum);
    }

    function invariant_AccountingBounds() public view {
        uint256 n = escrow.agreementCount();
        for (uint256 id = 1; id <= n; ++id) {
            Escrow.Agreement memory ag = escrow.getAgreement(id);
            assertLe(ag.releasedAmount, ag.fundedAmount, "released > funded");
            assertLe(ag.fundedAmount, ag.totalAmount, "funded > total");
            if (ag.status == Escrow.AgreementStatus.Completed) {
                assertEq(ag.releasedAmount, ag.totalAmount);
            }
            if (ag.status == Escrow.AgreementStatus.Created || ag.status == Escrow.AgreementStatus.Cancelled) {
                assertEq(ag.fundedAmount, 0);
            }
        }
    }

    function invariant_PartiesNeverChange() public view {
        uint256 n = escrow.agreementCount();
        for (uint256 id = 1; id <= n; ++id) {
            Escrow.Agreement memory ag = escrow.getAgreement(id);
            assertEq(ag.payer, handler.recordedPayer(id));
            assertEq(ag.recipient, handler.recordedRecipient(id));
            assertTrue(ag.recipient != handler.attacker());
        }
    }

    /// Reports how many handler calls actually succeeded (exploration depth).
    function afterInvariant() public view {
        console2.log("ok create/fund/approve:", handler.okCreate(), handler.okFund(), handler.okApprove());
        console2.log("ok release/cancel:", handler.okRelease(), handler.okCancel());
    }
}
