// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CoindeccFlowEscrow as Escrow} from "../../CoindeccFlowEscrow.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @dev USDC mock with a blocklist like Arc's USDC: any transfer whose sender or
/// receiver is blocklisted reverts. Minting to a blocked address also reverts.
contract BlocklistUSDC is MockUSDC {
    error Blocked(address account);

    mapping(address => bool) public blocked;

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}

/// @dev Fuzz handler that plays an adversary. It calls all six mutating escrow
/// functions with arbitrary ids / indexes from the attacker, the honest payer,
/// the honest recipient and an outsider, so every call lands in whatever state
/// the escrow happens to be in. The attacker is never named recipient of any
/// agreement, so it is never entitled to a single base unit from the escrow.
contract AttackerHandler is Test {
    Escrow public escrow;
    MockUSDC public usdc;

    address public payer = address(0xA11CE);
    address public recipient = address(0xB0B);
    address public outsider = address(0xCAFE);
    address public attacker = address(0xBAD);

    uint256 public constant START = 1_000_000_000e6;

    bool public attackerGained;
    uint256 public okCreate;
    uint256 public okFund;
    uint256 public okApprove;
    uint256 public okRelease;
    uint256 public okCancel;

    mapping(uint256 => address) public recordedPayer;
    mapping(uint256 => address) public recordedRecipient;

    constructor(Escrow e, MockUSDC u) {
        escrow = e;
        usdc = u;
        address[4] memory all = _actors();
        for (uint256 i; i < 4; ++i) {
            u.mint(all[i], START);
            vm.prank(all[i]);
            u.approve(address(e), type(uint256).max);
        }
    }

    modifier track() {
        uint256 before = usdc.balanceOf(attacker);
        _;
        if (usdc.balanceOf(attacker) > before) attackerGained = true;
    }

    function _actors() internal view returns (address[4] memory a) {
        a = [attacker, payer, recipient, outsider];
    }

    function _who(uint256 seed) internal view returns (address) {
        return _actors()[seed % 4];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return bound(seed, 0, escrow.agreementCount() + 2);
    }

    function create(uint256 actorSeed, uint256 recSeed, uint256 n, uint256 a) external track {
        address[3] memory recs = [recipient, payer, outsider];
        address rec = recs[recSeed % 3];
        n = bound(n, 1, 3);
        string[] memory t = new string[](n);
        string[] memory d = new string[](n);
        uint256[] memory amts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            t[i] = "m";
            amts[i] = bound(uint256(keccak256(abi.encode(a, i))), 1, 1_000e6);
        }
        vm.prank(_who(actorSeed));
        try escrow.createAgreement(rec, "T", t, d, amts) returns (uint256 id) {
            Escrow.Agreement memory ag = escrow.getAgreement(id);
            recordedPayer[id] = ag.payer;
            recordedRecipient[id] = ag.recipient;
            ++okCreate;
        } catch {}
    }

    function fund(uint256 actorSeed, uint256 idSeed) external track {
        uint256 id = _id(idSeed);
        address who = _who(actorSeed);
        vm.prank(who);
        try escrow.fundAgreement(id) {
            ++okFund;
        } catch {}
    }

    function approve(uint256 actorSeed, uint256 idSeed, uint256 idx) external track {
        uint256 id = _id(idSeed);
        address who = _who(actorSeed);
        vm.prank(who);
        try escrow.approveMilestone(id, bound(idx, 0, 3)) {
            ++okApprove;
        } catch {}
    }

    function release(uint256 actorSeed, uint256 idSeed, uint256 idx) external track {
        uint256 id = _id(idSeed);
        address who = _who(actorSeed);
        vm.prank(who);
        try escrow.releaseMilestone(id, bound(idx, 0, 3)) {
            ++okRelease;
        } catch {}
    }

    function cancel(uint256 actorSeed, uint256 idSeed) external track {
        uint256 id = _id(idSeed);
        address who = _who(actorSeed);
        vm.prank(who);
        try escrow.cancelAgreement(id) {
            ++okCancel;
        } catch {}
    }

    /// Steers the system into deeper states: the real payer funds, approves and
    /// the real payer/recipient releases an arbitrary milestone of an arbitrary id.
    /// Attacker calls above then hit those deeper (funded / partially released) states.
    function partiesProgress(uint256 idSeed, uint256 idx, bool byRecipient) external track {
        uint256 n = escrow.agreementCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        idx = bound(idx, 0, 2);
        Escrow.Agreement memory ag = escrow.getAgreement(id);
        vm.prank(ag.payer);
        try escrow.fundAgreement(id) {
            ++okFund;
        } catch {}
        vm.prank(ag.payer);
        try escrow.approveMilestone(id, idx) {
            ++okApprove;
        } catch {}
        vm.prank(byRecipient ? ag.recipient : ag.payer);
        try escrow.releaseMilestone(id, idx) {
            ++okRelease;
        } catch {}
    }

    /// The attacker donates tokens straight to the escrow (a pure loss for it).
    function donate(uint256 amount) external track {
        amount = bound(amount, 0, 1_000e6);
        vm.prank(attacker);
        usdc.transfer(address(escrow), amount);
    }
}
