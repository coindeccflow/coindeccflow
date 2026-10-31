// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CoindeccFlowEscrow
 * @notice Noncustodial ERC-20 USDC milestone-payment escrow for CoindeccFlow.
 * @dev Trust model: the payer controls milestone approvals; escrowed funds can
 * only be released to the agreement's fixed recipient. There is no administrator,
 * refund, rescue, pause, or upgrade mechanism. Unapproved funds remain locked.
 * The configured token must be trusted USDC with standard, non-rebasing ERC-20
 * behavior. On Arc its ERC-20 address is
 * 0x3600000000000000000000000000000000000000 (6 decimals).
 * Native gas USDC is not handled: no payable function, receive, or fallback exists.
 */
contract CoindeccFlowEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum AgreementStatus { Created, Funded, Completed, Cancelled }

    struct Milestone {
        string title;
        string description;
        uint256 amount;
        bool approved;
        bool released;
    }

    struct Agreement {
        uint256 id;
        address payer;
        address recipient;
        string title;
        uint256 totalAmount;
        uint256 fundedAmount;
        uint256 releasedAmount;
        uint64 createdAt;
        AgreementStatus status;
        uint32 milestoneCount;
        uint32 releasedCount;
    }

    /// @notice ERC-20 token used for all deposits and releases.
    IERC20 public immutable usdc;
    /// @notice Token decimals read from the configured token at construction.
    uint8 public immutable usdcDecimals;

    uint256 private _agreementCount;
    mapping(uint256 => Agreement) private _agreements;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(address => uint256[]) private _agreementIdsByPayer;
    mapping(address => uint256[]) private _agreementIdsByRecipient;

    error InvalidToken(address token);
    error InvalidRecipient(address recipient);
    error InvalidAgreementTitle();
    error InvalidMilestoneCount(uint256 count);
    error ArrayLengthMismatch();
    error InvalidMilestoneTitle(uint256 index);
    error MilestoneDescriptionTooLong(uint256 index);
    error InvalidMilestoneAmount(uint256 index);
    error AgreementNotFound(uint256 id);
    error OnlyPayer();
    error OnlyPayerOrRecipient();
    error InvalidAgreementStatus(AgreementStatus actual, AgreementStatus expected);
    error MilestoneIndexOutOfRange(uint256 index);
    error MilestoneAlreadyApproved(uint256 index);
    error MilestoneNotApproved(uint256 index);
    error MilestoneAlreadyReleased(uint256 index);
    error IncorrectFundingAmount(uint256 expected, uint256 received);

    event AgreementCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed recipient,
        uint256 totalAmount,
        string title,
        uint32 milestoneCount
    );
    event AgreementFunded(uint256 indexed id, address indexed payer, uint256 amount);
    event MilestoneApproved(uint256 indexed id, uint256 indexed index, address indexed payer);
    event MilestoneReleased(
        uint256 indexed id, uint256 indexed index, address indexed recipient, uint256 amount
    );
    event AgreementCompleted(uint256 indexed id, uint256 totalAmount);
    event AgreementCancelled(uint256 indexed id, address indexed payer);

    /**
     * @notice Configure the immutable ERC-20 USDC token.
     * @param usdc_ Deployed USDC token contract; never the native gas asset.
     */
    constructor(address usdc_) {
        if (usdc_ == address(0) || usdc_.code.length == 0) revert InvalidToken(usdc_);
        usdc = IERC20(usdc_);
        usdcDecimals = IERC20Metadata(usdc_).decimals();
    }

    /**
     * @notice Create an unfunded agreement with the caller as payer.
     * @param recipient Fixed destination of all milestone releases.
     * @param title Agreement title, between 1 and 100 bytes.
     * @param milestoneTitles Titles of 1 to 20 milestones, each 1 to 100 bytes.
     * @param milestoneDescriptions Descriptions, each at most 500 bytes.
     * @param milestoneAmounts Positive amounts in token base units.
     * @return id Newly allocated agreement id, starting at 1.
     */
    function createAgreement(
        address recipient,
        string calldata title,
        string[] calldata milestoneTitles,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external nonReentrant returns (uint256 id) {
        if (
            recipient == address(0) || recipient == msg.sender
                || recipient == address(this) || recipient == address(usdc)
        ) revert InvalidRecipient(recipient);
        if (bytes(title).length == 0 || bytes(title).length > 100) revert InvalidAgreementTitle();
        uint256 count = milestoneTitles.length;
        if (count == 0 || count > 20) revert InvalidMilestoneCount(count);
        if (milestoneDescriptions.length != count || milestoneAmounts.length != count) {
            revert ArrayLengthMismatch();
        }

        id = ++_agreementCount;
        uint256 totalAmount;
        for (uint256 i; i < count; ++i) {
            if (bytes(milestoneTitles[i]).length == 0 || bytes(milestoneTitles[i]).length > 100) {
                revert InvalidMilestoneTitle(i);
            }
            if (bytes(milestoneDescriptions[i]).length > 500) {
                revert MilestoneDescriptionTooLong(i);
            }
            if (milestoneAmounts[i] == 0) revert InvalidMilestoneAmount(i);
            totalAmount += milestoneAmounts[i];
            _milestones[id].push(Milestone({
                title: milestoneTitles[i],
                description: milestoneDescriptions[i],
                amount: milestoneAmounts[i],
                approved: false,
                released: false
            }));
        }

        _agreements[id] = Agreement({
            id: id,
            payer: msg.sender,
            recipient: recipient,
            title: title,
            totalAmount: totalAmount,
            fundedAmount: 0,
            releasedAmount: 0,
            createdAt: uint64(block.timestamp),
            status: AgreementStatus.Created,
            milestoneCount: uint32(count),
            releasedCount: 0
        });
        _agreementIdsByPayer[msg.sender].push(id);
        _agreementIdsByRecipient[recipient].push(id);
        emit AgreementCreated(id, msg.sender, recipient, totalAmount, title, uint32(count));
    }

    /**
     * @notice Fund an agreement exactly once, in full, using an ERC-20 allowance.
     * @param id Existing Created agreement owned by the caller as payer.
     */
    function fundAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = _getAgreement(id);
        if (msg.sender != agreement.payer) revert OnlyPayer();
        _requireStatus(agreement, AgreementStatus.Created);
        uint256 amount = agreement.totalAmount;
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = usdc.balanceOf(address(this));
        // Explicitly reject a decreasing balance as well as any inexact receipt.
        if (balanceAfter < balanceBefore) revert IncorrectFundingAmount(amount, 0);
        uint256 received = balanceAfter - balanceBefore;
        if (received != amount) revert IncorrectFundingAmount(amount, received);
        agreement.fundedAmount = amount;
        agreement.status = AgreementStatus.Funded;
        emit AgreementFunded(id, msg.sender, amount);
    }

    /**
     * @notice Approve a funded milestone; only its payer may approve it.
     * @param id Existing Funded agreement id.
     * @param index Zero-based milestone index.
     */
    function approveMilestone(uint256 id, uint256 index) external nonReentrant {
        Agreement storage agreement = _getAgreement(id);
        if (msg.sender != agreement.payer) revert OnlyPayer();
        _requireStatus(agreement, AgreementStatus.Funded);
        Milestone storage milestone = _getMilestone(id, index);
        if (milestone.approved) revert MilestoneAlreadyApproved(index);
        milestone.approved = true;
        emit MilestoneApproved(id, index, msg.sender);
    }

    /**
     * @notice Release an approved milestone to its fixed recipient.
     * @dev Only the payer or recipient may call. All accounting precedes transfer.
     * @param id Existing Funded agreement id.
     * @param index Zero-based milestone index.
     */
    function releaseMilestone(uint256 id, uint256 index) external nonReentrant {
        Agreement storage agreement = _getAgreement(id);
        if (msg.sender != agreement.payer && msg.sender != agreement.recipient) {
            revert OnlyPayerOrRecipient();
        }
        _requireStatus(agreement, AgreementStatus.Funded);
        Milestone storage milestone = _getMilestone(id, index);
        if (!milestone.approved) revert MilestoneNotApproved(index);
        if (milestone.released) revert MilestoneAlreadyReleased(index);

        uint256 amount = milestone.amount;
        milestone.released = true;
        agreement.releasedAmount += amount;
        ++agreement.releasedCount;
        bool completed = agreement.releasedCount == agreement.milestoneCount;
        if (completed) agreement.status = AgreementStatus.Completed;

        usdc.safeTransfer(agreement.recipient, amount);
        emit MilestoneReleased(id, index, agreement.recipient, amount);
        if (completed) emit AgreementCompleted(id, agreement.totalAmount);
    }

    /**
     * @notice Cancel an agreement before any funding; no tokens move.
     * @param id Existing Created agreement owned by the caller as payer.
     */
    function cancelAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = _getAgreement(id);
        if (msg.sender != agreement.payer) revert OnlyPayer();
        _requireStatus(agreement, AgreementStatus.Created);
        agreement.status = AgreementStatus.Cancelled;
        emit AgreementCancelled(id, msg.sender);
    }

    /// @notice Return an existing agreement; nonexistent ids revert.
    /// @param id Agreement id.
    /// @return agreement Full agreement data.
    function getAgreement(uint256 id) external view returns (Agreement memory agreement) {
        return _getAgreement(id);
    }

    /// @notice Return all milestones of an existing agreement.
    /// @param id Agreement id; nonexistent ids revert.
    /// @return milestones Ordered milestone data.
    function getMilestones(uint256 id) external view returns (Milestone[] memory milestones) {
        _getAgreement(id);
        return _milestones[id];
    }

    /// @notice Return isolated funded-minus-released accounting, not token balance.
    /// @param id Agreement id; nonexistent ids revert.
    /// @return balance Remaining escrowed base units for this agreement.
    function getAgreementBalance(uint256 id) external view returns (uint256 balance) {
        Agreement storage agreement = _getAgreement(id);
        return agreement.fundedAmount - agreement.releasedAmount;
    }

    /// @notice Return the number of agreements created, including cancelled ones.
    /// @return count Total agreement count; also the largest allocated id.
    function agreementCount() external view returns (uint256 count) {
        return _agreementCount;
    }

    /// @notice Return agreement ids for a payer in creation order.
    /// @param payer Address whose payer history is requested.
    /// @return ids All agreement ids associated with this payer.
    function getAgreementIdsByPayer(address payer) external view returns (uint256[] memory ids) {
        return _agreementIdsByPayer[payer];
    }

    /// @notice Return agreement ids for a recipient in creation order.
    /// @param recipient Address whose recipient history is requested.
    /// @return ids All agreement ids associated with this recipient.
    function getAgreementIdsByRecipient(address recipient) external view returns (uint256[] memory ids) {
        return _agreementIdsByRecipient[recipient];
    }

    function _getAgreement(uint256 id) private view returns (Agreement storage agreement) {
        if (id == 0 || id > _agreementCount) revert AgreementNotFound(id);
        return _agreements[id];
    }

    function _getMilestone(uint256 id, uint256 index) private view returns (Milestone storage milestone) {
        if (index >= _milestones[id].length) revert MilestoneIndexOutOfRange(index);
        return _milestones[id][index];
    }

    function _requireStatus(Agreement storage agreement, AgreementStatus expected) private view {
        if (agreement.status != expected) revert InvalidAgreementStatus(agreement.status, expected);
    }
}
