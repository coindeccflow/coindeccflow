// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CoindeccFlowEscrow as Escrow} from "../CoindeccFlowEscrow.sol";
import {MockUSDC, FeeOnTransferUSDC, ReentrantUSDC} from "./mocks/MockUSDC.sol";

contract CoindeccFlowEscrowTest is Test {
    Escrow internal escrow;
    MockUSDC internal usdc;
    address internal payer = makeAddr("payer");
    address internal recipient = makeAddr("recipient");
    address internal other = makeAddr("other");

    uint256 internal constant FUND = 1_000e6;

    function setUp() public virtual {
        usdc = new MockUSDC();
        escrow = new Escrow(address(usdc));
        usdc.mint(payer, FUND);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ---------- helpers ----------
    function _str(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = "a";
        return string(b);
    }

    function _arrs(uint256[] memory amounts)
        internal
        pure
        returns (string[] memory titles, string[] memory descs)
    {
        titles = new string[](amounts.length);
        descs = new string[](amounts.length);
        for (uint256 i; i < amounts.length; ++i) {
            titles[i] = string.concat("M", vm.toString(i));
            descs[i] = string.concat("D", vm.toString(i));
        }
    }

    function _amts2(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    function _createFor(Escrow e, address who, address to, uint256[] memory amounts) internal returns (uint256 id) {
        (string[] memory t, string[] memory d) = _arrs(amounts);
        vm.prank(who);
        id = e.createAgreement(to, "Deal", t, d, amounts);
    }

    function _create(uint256[] memory amounts) internal returns (uint256) {
        return _createFor(escrow, payer, recipient, amounts);
    }

    function _createFunded(uint256[] memory amounts) internal returns (uint256 id) {
        id = _create(amounts);
        vm.prank(payer);
        escrow.fundAgreement(id);
    }

    function _approve(uint256 id, uint256 i) internal {
        vm.prank(payer);
        escrow.approveMilestone(id, i);
    }

    function _release(uint256 id, uint256 i, address by) internal {
        vm.prank(by);
        escrow.releaseMilestone(id, i);
    }

    function _expectErr(bytes memory err) internal {
        vm.expectRevert(err);
    }

    // ---------- constructor ----------
    function test_Constructor_StoresTokenAndDecimals() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.usdcDecimals(), 6);
    }

    function test_Constructor_RejectsZeroAndNonContractToken() public {
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidToken.selector, address(0)));
        new Escrow(address(0));
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidToken.selector, other));
        new Escrow(other);
    }

    // ---------- creation ----------
    function test_CreateAgreement_StoresFieldsAndIds() public {
        vm.warp(1_700_000_000);
        uint256 id = _create(_amts2(0.1e6, 0.1e6));
        assertEq(id, 1);
        assertEq(escrow.agreementCount(), 1);
        Escrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.id, 1);
        assertEq(a.payer, payer);
        assertEq(a.recipient, recipient);
        assertEq(a.title, "Deal");
        assertEq(a.totalAmount, 0.2e6);
        assertEq(a.fundedAmount, 0);
        assertEq(a.releasedAmount, 0);
        assertEq(a.createdAt, 1_700_000_000);
        assertEq(uint8(a.status), uint8(Escrow.AgreementStatus.Created));
        assertEq(a.milestoneCount, 2);
        assertEq(a.releasedCount, 0);

        Escrow.Milestone[] memory ms = escrow.getMilestones(id);
        assertEq(ms.length, 2);
        assertEq(ms[1].title, "M1");
        assertEq(ms[1].description, "D1");
        assertEq(ms[1].amount, 0.1e6);
        assertFalse(ms[1].approved);
        assertFalse(ms[1].released);
    }

    function test_CreateAgreement_EmitsEvent() public {
        uint256[] memory amts = _amts2(3e6, 4e6);
        (string[] memory t, string[] memory d) = _arrs(amts);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit Escrow.AgreementCreated(1, payer, recipient, 7e6, "Deal", 2);
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, amts);
    }

    function test_CreateAgreement_IncrementingIdsAndIdLists() public {
        address recipient2 = makeAddr("recipient2");
        uint256 id1 = _create(_amts2(1, 1));
        uint256 id2 = _createFor(escrow, payer, recipient2, _amts2(1, 1));
        uint256 id3 = _createFor(escrow, other, recipient, _amts2(1, 1));
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        uint256[] memory p = escrow.getAgreementIdsByPayer(payer);
        assertEq(p.length, 2);
        assertEq(p[0], 1);
        assertEq(p[1], 2);
        uint256[] memory r = escrow.getAgreementIdsByRecipient(recipient);
        assertEq(r.length, 2);
        assertEq(r[0], 1);
        assertEq(r[1], 3);
        assertEq(escrow.getAgreementIdsByPayer(other).length, 1);
        assertEq(escrow.getAgreementIdsByRecipient(recipient2).length, 1);
    }

    function test_CreateAgreement_RevertsInvalidRecipient() public {
        uint256[] memory amts = _amts2(1, 1);
        (string[] memory t, string[] memory d) = _arrs(amts);
        address[4] memory bad = [address(0), payer, address(escrow), address(usdc)];
        for (uint256 i; i < 4; ++i) {
            vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidRecipient.selector, bad[i]));
            vm.prank(payer);
            escrow.createAgreement(bad[i], "Deal", t, d, amts);
        }
    }

    function test_CreateAgreement_RevertsEmptyMilestones() public {
        string[] memory t = new string[](0);
        string[] memory d = new string[](0);
        uint256[] memory a = new uint256[](0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidMilestoneCount.selector, 0));
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, a);
    }

    function test_CreateAgreement_RevertsTooManyMilestones() public {
        uint256[] memory a = new uint256[](21);
        for (uint256 i; i < 21; ++i) a[i] = 1;
        (string[] memory t, string[] memory d) = _arrs(a);
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidMilestoneCount.selector, 21));
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, a);
    }

    function test_CreateAgreement_AllowsExactly20Milestones() public {
        uint256[] memory a = new uint256[](20);
        for (uint256 i; i < 20; ++i) a[i] = 1;
        uint256 id = _create(a);
        assertEq(escrow.getAgreement(id).milestoneCount, 20);
    }

    function test_CreateAgreement_RevertsArrayLengthMismatch() public {
        uint256[] memory a = _amts2(1, 1);
        (string[] memory t, string[] memory d) = _arrs(a);
        uint256[] memory shortA = new uint256[](1);
        shortA[0] = 1;
        vm.expectRevert(Escrow.ArrayLengthMismatch.selector);
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, shortA);

        string[] memory shortD = new string[](1);
        shortD[0] = "x";
        vm.expectRevert(Escrow.ArrayLengthMismatch.selector);
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, shortD, a);
    }

    function test_CreateAgreement_RevertsZeroAmount() public {
        uint256[] memory a = _amts2(1, 0);
        (string[] memory t, string[] memory d) = _arrs(a);
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidMilestoneAmount.selector, 1));
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, a);
    }

    function test_CreateAgreement_RevertsOverlongOrEmptyTitles() public {
        uint256[] memory a = _amts2(1, 1);
        (string[] memory t, string[] memory d) = _arrs(a);

        vm.expectRevert(Escrow.InvalidAgreementTitle.selector);
        vm.prank(payer);
        escrow.createAgreement(recipient, _str(101), t, d, a);
        vm.expectRevert(Escrow.InvalidAgreementTitle.selector);
        vm.prank(payer);
        escrow.createAgreement(recipient, "", t, d, a);

        t[1] = _str(101);
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidMilestoneTitle.selector, 1));
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, a);
        t[1] = "";
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidMilestoneTitle.selector, 1));
        vm.prank(payer);
        escrow.createAgreement(recipient, "Deal", t, d, a);

        t[1] = _str(100); // boundary OK
        d[0] = _str(501);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneDescriptionTooLong.selector, 0));
        vm.prank(payer);
        escrow.createAgreement(recipient, _str(100), t, d, a);
        d[0] = _str(500);
        vm.prank(payer);
        escrow.createAgreement(recipient, _str(100), t, d, a);
    }

    // ---------- funding ----------
    function test_Fund_ExactAccountingAndEvent() public {
        uint256 id = _create(_amts2(0.1e6, 0.1e6));
        vm.expectEmit(true, true, false, true, address(escrow));
        emit Escrow.AgreementFunded(id, payer, 0.2e6);
        vm.prank(payer);
        escrow.fundAgreement(id);
        assertEq(usdc.balanceOf(address(escrow)), 0.2e6);
        assertEq(usdc.balanceOf(payer), FUND - 0.2e6);
        Escrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.fundedAmount, 0.2e6);
        assertEq(uint8(a.status), uint8(Escrow.AgreementStatus.Funded));
        assertEq(escrow.getAgreementBalance(id), 0.2e6);
    }

    function test_Fund_RevertsForNonPayer() public {
        uint256 id = _create(_amts2(1e6, 1e6));
        usdc.mint(other, 10e6);
        vm.prank(other);
        usdc.approve(address(escrow), type(uint256).max);
        for (uint256 i; i < 2; ++i) {
            address who = i == 0 ? other : recipient;
            vm.expectRevert(Escrow.OnlyPayer.selector);
            vm.prank(who);
            escrow.fundAgreement(id);
        }
    }

    function test_Fund_RevertsDoubleFunding() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Funded, Escrow.AgreementStatus.Created
            )
        );
        vm.prank(payer);
        escrow.fundAgreement(id);
        assertEq(usdc.balanceOf(address(escrow)), 2e6);
    }

    function test_Fund_RevertsNonexistentAgreement() public {
        vm.expectRevert(abi.encodeWithSelector(Escrow.AgreementNotFound.selector, 0));
        escrow.getAgreement(0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.AgreementNotFound.selector, 5));
        vm.prank(payer);
        escrow.fundAgreement(5);
    }

    function test_Fund_RevertsWithoutAllowanceOrBalance() public {
        uint256 id = _create(_amts2(FUND, 1));
        vm.expectRevert(); // insufficient balance
        vm.prank(payer);
        escrow.fundAgreement(id);
        vm.prank(payer);
        usdc.approve(address(escrow), 0);
        uint256 id2 = _create(_amts2(1, 1));
        vm.expectRevert(); // insufficient allowance
        vm.prank(payer);
        escrow.fundAgreement(id2);
    }

    function test_Fund_RejectsFeeOnTransferToken() public {
        FeeOnTransferUSDC fee = new FeeOnTransferUSDC();
        Escrow e = new Escrow(address(fee));
        fee.mint(payer, FUND);
        vm.prank(payer);
        fee.approve(address(e), type(uint256).max);
        uint256 id = _createFor(e, payer, recipient, _amts2(100e6, 100e6));
        vm.expectRevert(abi.encodeWithSelector(Escrow.IncorrectFundingAmount.selector, 200e6, 198e6));
        vm.prank(payer);
        e.fundAgreement(id);
        assertEq(fee.balanceOf(address(e)), 0);
        assertEq(uint8(e.getAgreement(id).status), uint8(Escrow.AgreementStatus.Created));
    }

    // ---------- approval ----------
    function test_Approve_Success() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        vm.expectEmit(true, true, true, true, address(escrow));
        emit Escrow.MilestoneApproved(id, 1, payer);
        _approve(id, 1);
        Escrow.Milestone[] memory ms = escrow.getMilestones(id);
        assertFalse(ms[0].approved);
        assertTrue(ms[1].approved);
    }

    function test_Approve_RevertsForNonPayer() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(Escrow.OnlyPayer.selector);
            vm.prank(i == 0 ? recipient : other);
            escrow.approveMilestone(id, 0);
        }
    }

    function test_Approve_RevertsUnfundedDuplicateAndOutOfRange() public {
        uint256 id = _create(_amts2(1e6, 1e6));
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Created, Escrow.AgreementStatus.Funded
            )
        );
        vm.prank(payer);
        escrow.approveMilestone(id, 0);

        vm.prank(payer);
        escrow.fundAgreement(id);
        _approve(id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneAlreadyApproved.selector, 0));
        vm.prank(payer);
        escrow.approveMilestone(id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneIndexOutOfRange.selector, 2));
        vm.prank(payer);
        escrow.approveMilestone(id, 2);
    }

    // ---------- release ----------
    function test_Release_RevertsWhenUnfunded() public {
        uint256 id = _create(_amts2(1e6, 1e6));
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Created, Escrow.AgreementStatus.Funded
            )
        );
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_RevertsWhenUnapproved() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneNotApproved.selector, 0));
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneNotApproved.selector, 1));
        vm.prank(recipient);
        escrow.releaseMilestone(id, 1);
    }

    function test_Release_ByPayerAndByRecipient() public {
        uint256 id = _createFunded(_amts2(0.1e6, 0.1e6));
        _approve(id, 0);
        _approve(id, 1);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit Escrow.MilestoneReleased(id, 0, recipient, 0.1e6);
        _release(id, 0, payer);
        assertEq(usdc.balanceOf(recipient), 0.1e6);
        assertEq(escrow.getAgreementBalance(id), 0.1e6);
        _release(id, 1, recipient);
        assertEq(usdc.balanceOf(recipient), 0.2e6);
        assertEq(escrow.getAgreementBalance(id), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Release_RevertsForThirdParty() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        _approve(id, 0);
        vm.expectRevert(Escrow.OnlyPayerOrRecipient.selector);
        vm.prank(other);
        escrow.releaseMilestone(id, 0);
    }

    function test_Release_RevertsDuplicateAndOutOfRange() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        _approve(id, 0);
        _release(id, 0, payer);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneAlreadyReleased.selector, 0));
        vm.prank(recipient);
        escrow.releaseMilestone(id, 0);
        vm.expectRevert(abi.encodeWithSelector(Escrow.MilestoneIndexOutOfRange.selector, 9));
        vm.prank(payer);
        escrow.releaseMilestone(id, 9);
        assertEq(usdc.balanceOf(recipient), 1e6);
    }

    function test_Release_NoDuplicateAfterCompletion() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        _approve(id, 0);
        _approve(id, 1);
        _release(id, 0, payer);
        _release(id, 1, payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Completed, Escrow.AgreementStatus.Funded
            )
        );
        vm.prank(payer);
        escrow.releaseMilestone(id, 0);
        assertEq(usdc.balanceOf(recipient), 2e6);
    }

    // ---------- completion ----------
    function test_Completion_StatusAndEvent() public {
        uint256 id = _createFunded(_amts2(1e6, 2e6));
        _approve(id, 0);
        _approve(id, 1);
        _release(id, 0, payer);
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Funded));
        vm.expectEmit(true, true, true, true, address(escrow));
        emit Escrow.MilestoneReleased(id, 1, recipient, 2e6);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit Escrow.AgreementCompleted(id, 3e6);
        _release(id, 1, recipient);
        Escrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(uint8(a.status), uint8(Escrow.AgreementStatus.Completed));
        assertEq(a.releasedAmount, 3e6);
        assertEq(a.releasedCount, 2);
    }

    // ---------- cancel ----------
    function test_Cancel_WhileUnfunded() public {
        uint256 id = _create(_amts2(1e6, 1e6));
        vm.expectEmit(true, true, false, true, address(escrow));
        emit Escrow.AgreementCancelled(id, payer);
        vm.prank(payer);
        escrow.cancelAgreement(id);
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Cancelled));
        assertEq(escrow.agreementCount(), 1);
        // cannot fund a cancelled agreement
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Created
            )
        );
        vm.prank(payer);
        escrow.fundAgreement(id);
    }

    function test_Cancel_RevertsForNonPayer() public {
        uint256 id = _create(_amts2(1e6, 1e6));
        vm.expectRevert(Escrow.OnlyPayer.selector);
        vm.prank(other);
        escrow.cancelAgreement(id);
        vm.expectRevert(Escrow.OnlyPayer.selector);
        vm.prank(recipient);
        escrow.cancelAgreement(id);
    }

    function test_Cancel_RevertsOnceFundedOrAlreadyCancelled() public {
        uint256 id = _createFunded(_amts2(1e6, 1e6));
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Funded, Escrow.AgreementStatus.Created
            )
        );
        vm.prank(payer);
        escrow.cancelAgreement(id);
        uint256 id2 = _create(_amts2(1, 1));
        vm.prank(payer);
        escrow.cancelAgreement(id2);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidAgreementStatus.selector, Escrow.AgreementStatus.Cancelled, Escrow.AgreementStatus.Created
            )
        );
        vm.prank(payer);
        escrow.cancelAgreement(id2);
    }

    // ---------- demo flow ----------
    function test_DemoFlow_TwoMilestones_0_20USDC() public {
        usdc.mint(payer, 0); // payer already holds FUND
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 id = _create(_amts2(0.1e6, 0.1e6));
        assertEq(escrow.getAgreement(id).totalAmount, 200_000);
        vm.prank(payer);
        escrow.fundAgreement(id);
        assertEq(usdc.balanceOf(address(escrow)), 200_000);
        _approve(id, 0);
        _release(id, 0, payer);
        assertEq(usdc.balanceOf(recipient), 100_000);
        assertEq(escrow.getAgreementBalance(id), 100_000);
        _approve(id, 1);
        _release(id, 1, recipient);
        assertEq(usdc.balanceOf(recipient), 200_000);
        assertEq(usdc.balanceOf(payer), payerBefore - 200_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Completed));
    }

    // ---------- accounting & isolation ----------
    function test_MultipleAgreements_AreIsolated() public {
        address recipient2 = makeAddr("recipient2");
        usdc.mint(other, 500e6);
        vm.prank(other);
        usdc.approve(address(escrow), type(uint256).max);

        uint256 id1 = _createFunded(_amts2(10e6, 20e6));
        uint256 id2 = _createFor(escrow, other, recipient2, _amts2(5e6, 7e6));
        vm.prank(other);
        escrow.fundAgreement(id2);

        assertEq(escrow.getAgreementBalance(id1), 30e6);
        assertEq(escrow.getAgreementBalance(id2), 12e6);
        assertEq(usdc.balanceOf(address(escrow)), 42e6);

        _approve(id1, 0);
        _release(id1, 0, recipient);
        assertEq(escrow.getAgreementBalance(id1), 20e6);
        assertEq(escrow.getAgreementBalance(id2), 12e6);
        assertEq(usdc.balanceOf(recipient2), 0);
        assertEq(
            usdc.balanceOf(address(escrow)), escrow.getAgreementBalance(id1) + escrow.getAgreementBalance(id2)
        );

        // payer of agreement 1 has no power over agreement 2
        vm.expectRevert(Escrow.OnlyPayer.selector);
        vm.prank(payer);
        escrow.approveMilestone(id2, 0);
        // recipient of agreement 1 cannot release agreement 2
        vm.prank(other);
        escrow.approveMilestone(id2, 0);
        vm.expectRevert(Escrow.OnlyPayerOrRecipient.selector);
        vm.prank(recipient);
        escrow.releaseMilestone(id2, 0);
        assertEq(uint8(escrow.getAgreement(id1).status), uint8(Escrow.AgreementStatus.Funded));
    }

    // ---------- reentrancy ----------
    function _reentrantSetup() internal returns (ReentrantUSDC tok, Escrow e, uint256 id) {
        tok = new ReentrantUSDC();
        e = new Escrow(address(tok));
        tok.mint(payer, FUND);
        vm.prank(payer);
        tok.approve(address(e), type(uint256).max);
        id = _createFor(e, payer, recipient, _amts2(1e6, 1e6));
    }

    function test_Reentrancy_FundAgreementReenterFails() public {
        (ReentrantUSDC tok, Escrow e, uint256 id) = _reentrantSetup();
        tok.arm(address(e), abi.encodeCall(Escrow.fundAgreement, (id)));
        vm.prank(payer);
        e.fundAgreement(id);
        assertTrue(tok.attempted());
        assertFalse(tok.reentrySucceeded());
        assertEq(bytes4(tok.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(tok.balanceOf(address(e)), 2e6);
        assertEq(e.getAgreement(id).fundedAmount, 2e6);
    }

    function test_Reentrancy_ReleaseMilestoneReenterFails() public {
        (ReentrantUSDC tok, Escrow e, uint256 id) = _reentrantSetup();
        vm.startPrank(payer);
        e.fundAgreement(id);
        e.approveMilestone(id, 0);
        e.approveMilestone(id, 1);
        vm.stopPrank();
        tok.arm(address(e), abi.encodeCall(Escrow.releaseMilestone, (id, 1)));
        vm.prank(payer);
        e.releaseMilestone(id, 0);
        assertTrue(tok.attempted());
        assertFalse(tok.reentrySucceeded());
        assertEq(bytes4(tok.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(tok.balanceOf(recipient), 1e6);
        assertEq(tok.balanceOf(address(e)), 1e6);
        assertEq(e.getAgreementBalance(id), 1e6);
    }

    function test_Reentrancy_ReleaseSameMilestoneReenterFailsNoDoublePayout() public {
        (ReentrantUSDC tok, Escrow e, uint256 id) = _reentrantSetup();
        vm.startPrank(payer);
        e.fundAgreement(id);
        e.approveMilestone(id, 0);
        vm.stopPrank();
        tok.arm(address(e), abi.encodeCall(Escrow.releaseMilestone, (id, 0)));
        vm.prank(recipient);
        e.releaseMilestone(id, 0);
        assertFalse(tok.reentrySucceeded());
        assertEq(tok.balanceOf(recipient), 1e6);
        assertEq(tok.balanceOf(address(e)), 1e6);
    }

    function test_Reentrancy_CreateAgreementDuringReleaseFails() public {
        (ReentrantUSDC tok, Escrow e, uint256 id) = _reentrantSetup();
        vm.startPrank(payer);
        e.fundAgreement(id);
        e.approveMilestone(id, 0);
        vm.stopPrank();
        uint256[] memory a = _amts2(1, 1);
        (string[] memory t, string[] memory d) = _arrs(a);
        tok.arm(address(e), abi.encodeCall(Escrow.createAgreement, (other, "x", t, d, a)));
        vm.prank(payer);
        e.releaseMilestone(id, 0);
        assertFalse(tok.reentrySucceeded());
        assertEq(e.agreementCount(), 1);
    }

    // ---------- fuzz ----------
    function testFuzz_ReleasePayoutsSumToFundedTotal(uint256 a0, uint256 a1, uint256 a2, uint8 callerBits) public {
        a0 = bound(a0, 1, 100e6);
        a1 = bound(a1, 1, 100e6);
        a2 = bound(a2, 1, 100e6);
        uint256[] memory amts = new uint256[](3);
        amts[0] = a0;
        amts[1] = a1;
        amts[2] = a2;
        uint256 total = a0 + a1 + a2;
        uint256 id = _createFunded(amts);
        assertEq(usdc.balanceOf(address(escrow)), total);
        uint256 paid;
        for (uint256 i; i < 3; ++i) {
            _approve(id, i);
            _release(id, i, (callerBits >> i) & 1 == 1 ? payer : recipient);
            paid += amts[i];
            assertEq(usdc.balanceOf(recipient), paid);
            assertEq(escrow.getAgreementBalance(id), total - paid);
            assertEq(usdc.balanceOf(address(escrow)), total - paid);
        }
        assertEq(usdc.balanceOf(recipient), total);
        assertEq(escrow.getAgreement(id).releasedAmount, total);
        assertEq(uint8(escrow.getAgreement(id).status), uint8(Escrow.AgreementStatus.Completed));
    }
}
