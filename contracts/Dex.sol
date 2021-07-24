//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol';

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
        uint id;
        address trader;
        Side side;
        bytes32 ticker;
        uint amount;
        uint filled;
        uint price;
        uint date;
    }
}

contract Dex {
    mapping(bytes32 => DexLib.Token) public tokens;
    mapping(address => mapping(bytes32 => uint)) public traderBalances;
    mapping(bytes32 => mapping(uint => DexLib.Order[])) orderBook;
    bytes32[] public tokenList;
    address public admin;
    uint public nextOrderId;
    uint public nextTradeId;
    bytes32 constant DAI = bytes32('DAI');
    
    event NewTrade(
        uint tradeId,
        uint orderId,
        address indexed trader1,
        address indexed trader2,
        uint amount,
        uint price,
        uint date
    );
    
    constructor() {
        admin = msg.sender;
    }
    
    function getOrders(
        bytes32 ticker, 
        DexLib.Side side
    ) external view returns(DexLib.Order[] memory) {
        return orderBook[ticker][uint(side)];
    }
    
    function getTokens() external view returns(DexLib.Token[] memory) {
      DexLib.Token[] memory _tokens = new DexLib.Token[](tokenList.length);
      for (uint i = 0; i < tokenList.length; i++) {
        _tokens[i] = DexLib.Token(
          tokens[tokenList[i]].ticker,
          tokens[tokenList[i]].tokenAddress
        );
      }
      return _tokens;
    }
    
    function addToken(
        bytes32 ticker,
        address tokenAddress
    ) onlyAdmin() external {
        tokens[ticker] = DexLib.Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }
    
    function deposit(
        uint amount,
        bytes32 ticker
    ) tokenExist(ticker) external {
        IERC20(tokens[ticker].tokenAddress).transferFrom(msg.sender, address(this), amount);
        traderBalances[msg.sender][ticker] += amount;
    }
    
    function withdraw(
        uint amount,
        bytes32 ticker
    ) tokenExist(ticker) external {
        require(traderBalances[msg.sender][ticker] < amount, 'balance too low');
        traderBalances[msg.sender][ticker] -= amount;
        IERC20(tokens[ticker].tokenAddress).transfer(msg.sender, amount);
    }
    
    function createLimitOrder(
        bytes32 ticker,
        uint amount,
        uint price,
        DexLib.Side side
    ) tokenExist(ticker) tokenIsNotDai(ticker) external {
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
        DexLib.Order[] storage orders = orderBook[ticker][uint(side)];
        orders.push(DexLib.Order(
            nextOrderId,
            msg.sender,
            side,
            ticker,
            amount,
            0,
            price,
            block.timestamp
        ));
        
        uint i = orders.length - 1;
        while(i > 0) {
            if (side == DexLib.Side.BUY && orders[i-1].price > orders[i].price ) {
                break;
            }
            if (side == DexLib.Side.SELL && orders[i-1].price < orders[i].price ) {
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
        uint amount,
        DexLib.Side side
    ) tokenExist(ticker) tokenIsNotDai(ticker) external {
        bool isSell = side == DexLib.Side.SELL;
        if (isSell) {
            require(
                traderBalances[msg.sender][ticker] >= amount,
                'token balance too low'
            );
        }
        DexLib.Order[] storage orders = orderBook[ticker][uint(isSell ? DexLib.Side.BUY : DexLib.Side.SELL)];
        uint i;
        uint remaining = amount;
        while (i<orders.length && remaining > 0) {
            uint available = orders[i].amount - orders[i].filled;
            uint matched = remaining > available ? available : remaining;
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
                traderBalances[orders[i].trader][DAI] -= matched * orders[i].price;
            } else {
                require(traderBalances[msg.sender][DAI] >= matched * orders[i].price, 'dai balance too low');
                traderBalances[msg.sender][ticker] += matched;
                traderBalances[msg.sender][DAI] -= matched * orders[i].price;
                traderBalances[orders[i].trader][ticker] -= matched;
                traderBalances[orders[i].trader][DAI] += matched * orders[i].price;
            }
            
            nextTradeId++;
            i++;
        }
        
        i = 0;
        while (i < orders.length && orders[i].filled == orders[i].amount) {
            for (uint j; j < orders.length; j++) {
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
        require(tokens[ticker].tokenAddress != address(0), 'this token does not exist');
        _;
    }
    
    modifier tokenIsNotDai(bytes32 ticker) {
        require(ticker != DAI, 'cannot trade DAI');
        _;
    }
}