//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

library DexLib {
    enum Side {
        BUY,
        SELL
    }
    struct Token {
        bytes32 ticker;
        address tokenAddress;
    }
    struct Order {
        uint256 id;
        address trader;
        Side side;
        bytes32 ticker;
        uint256 amount;
        uint256 filled;
        uint256 price;
        uint256 date;
    }
}

contract Dex {
    mapping(bytes32 => DexLib.Token) public tokens;
    mapping(address => mapping(bytes32 => uint256)) public traderBalances;
    mapping(bytes32 => mapping(uint256 => DexLib.Order[])) orderBook;
    bytes32[] public tokenList;
    address public admin;
    uint256 public nextOrderId;
    uint256 public nextTradeId;
    bytes32 constant DAI = bytes32('DAI');

    event NewTrade(
        uint256 tradeId,
        uint256 orderId,
        address indexed trader1,
        address indexed trader2,
        uint256 amount,
        uint256 price,
        uint256 date
    );

    constructor() {
        admin = msg.sender;
    }

    function getOrders(bytes32 ticker, DexLib.Side side)
        external
        view
        returns (DexLib.Order[] memory)
    {
        return orderBook[ticker][uint256(side)];
    }

    function getTokens() external view returns (DexLib.Token[] memory) {
        DexLib.Token[] memory _tokens = new DexLib.Token[](tokenList.length);
        for (uint256 i = 0; i < tokenList.length; i++) {
            _tokens[i] = DexLib.Token(
                tokens[tokenList[i]].ticker,
                tokens[tokenList[i]].tokenAddress
            );
        }
        return _tokens;
    }

    function addToken(bytes32 ticker, address tokenAddress)
        external
        onlyAdmin()
    {
        tokens[ticker] = DexLib.Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }

    function deposit(uint256 amount, bytes32 ticker)
        external
        tokenExist(ticker)
    {
        IERC20(tokens[ticker].tokenAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        traderBalances[msg.sender][ticker] += amount;
    }

    function withdraw(uint256 amount, bytes32 ticker)
        external
        tokenExist(ticker)
    {
        require(
            traderBalances[msg.sender][ticker] >= amount,
            'balance too low'
        );
        traderBalances[msg.sender][ticker] -= amount;
        IERC20(tokens[ticker].tokenAddress).transfer(msg.sender, amount);
    }

    function createLimitOrder(
        bytes32 ticker,
        uint256 amount,
        uint256 price,
        DexLib.Side side
    ) external tokenExist(ticker) tokenIsNotDai(ticker) {
        if (side == DexLib.Side.SELL) {
            require(
                traderBalances[msg.sender][ticker] >= amount,
                'token balance too low'
            );
        } else {
            require(
                traderBalances[msg.sender][DAI] >= amount * price,
                'token balance too low'
            );
        }
        DexLib.Order[] storage orders = orderBook[ticker][uint256(side)];
        orders.push(
            DexLib.Order(
                nextOrderId,
                msg.sender,
                side,
                ticker,
                amount,
                0,
                price,
                block.timestamp
            )
        );

        uint256 i = orders.length - 1;
        while (i > 0) {
            if (
                side == DexLib.Side.BUY && orders[i - 1].price > orders[i].price
            ) {
                break;
            }
            if (
                side == DexLib.Side.SELL &&
                orders[i - 1].price < orders[i].price
            ) {
                break;
            }

            DexLib.Order memory order = orders[i - 1];
            orders[i - 1] = orders[i];
            orders[i] = order;
            i--;
        }
        nextOrderId++;
    }

    function createMarketOrder(
        bytes32 ticker,
        uint256 amount,
        DexLib.Side side
    ) external tokenExist(ticker) tokenIsNotDai(ticker) {
        bool isSell = side == DexLib.Side.SELL;
        if (isSell) {
            require(
                traderBalances[msg.sender][ticker] >= amount,
                'token balance too low'
            );
        }
        DexLib.Order[] storage orders = orderBook[ticker][
            uint256(isSell ? DexLib.Side.BUY : DexLib.Side.SELL)
        ];
        uint256 i;
        uint256 remaining = amount;
        while (i < orders.length && remaining > 0) {
            uint256 available = orders[i].amount - orders[i].filled;
            uint256 matched = remaining > available ? available : remaining;
            remaining -= matched;
            orders[i].filled += matched;
            emit NewTrade(
                nextTradeId,
                orders[i].id,
                orders[i].trader,
                msg.sender,
                matched,
                orders[i].price,
                block.timestamp
            );

            if (isSell) {
                traderBalances[msg.sender][ticker] -= matched;
                traderBalances[msg.sender][DAI] += matched * orders[i].price;
                traderBalances[orders[i].trader][ticker] += matched;
                traderBalances[orders[i].trader][DAI] -=
                    matched *
                    orders[i].price;
            } else {
                require(
                    traderBalances[msg.sender][DAI] >=
                        matched * orders[i].price,
                    'dai balance too low'
                );
                traderBalances[msg.sender][ticker] += matched;
                traderBalances[msg.sender][DAI] -= matched * orders[i].price;
                traderBalances[orders[i].trader][ticker] -= matched;
                traderBalances[orders[i].trader][DAI] +=
                    matched *
                    orders[i].price;
            }

            nextTradeId++;
            i++;
        }

        i = 0;
        while (i < orders.length && orders[i].filled == orders[i].amount) {
            for (uint256 j; j < orders.length; j++) {
                orders[j] = orders[j + 1];
            }
            orders.pop();
            i++;
        }
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, 'only admin');
        _;
    }

    modifier tokenExist(bytes32 ticker) {
        require(
            tokens[ticker].tokenAddress != address(0),
            'this token does not exist'
        );
        _;
    }

    modifier tokenIsNotDai(bytes32 ticker) {
        require(ticker != DAI, 'cannot trade DAI');
        _;
    }
}
