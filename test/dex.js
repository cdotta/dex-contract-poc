const { expectRevert } = require('@openzeppelin/test-helpers');
const Dai = artifacts.require('mocks/Dai.sol');
const Bat = artifacts.require('mocks/Bat.sol');
const Rep = artifacts.require('mocks/Rep.sol');
const Zrx = artifacts.require('mocks/Zrx.sol');
const Dex = artifacts.require('Dex.sol');

const SIDE = {
  BUY: 0,
  SELL: 1,
};

contract('Dex', (accounts) => {
  let dai, bat, rep, zrx, dex;
  const [_admin, trader1, trader2] = accounts;
  const [DAI, BAT, REP, ZRX] = [
    web3.utils.fromAscii('DAI'),
    web3.utils.fromAscii('BAT'),
    web3.utils.fromAscii('REP'),
    web3.utils.fromAscii('ZRX'),
  ];

  beforeEach(async () => {
    [dai, bat, rep, zrx] = await Promise.all([
      Dai.new(),
      Bat.new(),
      Rep.new(),
      Zrx.new(),
    ]);
    dex = await Dex.new();
    await Promise.all([
      dex.addToken(DAI, dai.address),
      dex.addToken(BAT, bat.address),
      dex.addToken(REP, rep.address),
    ]);

    const amount = web3.utils.toWei('1000');
    const seedTokenBalance = async (token, trader) => {
      await token.faucet(trader, amount);
      await token.approve(dex.address, amount, { from: trader });
    };

    await Promise.all(
      [dai, bat, rep, zrx].map((token) => seedTokenBalance(token, trader1)),
    );
    await Promise.all(
      [dai, bat, rep, zrx].map((token) => seedTokenBalance(token, trader2)),
    );
  });

  it.only('test', async () => {
    const amount = web3.utils.toWei('1000');
    await dex.deposit(amount, DAI, { from: trader1 });
    await dex.deposit(amount, BAT, { from: trader2 });
    await dex.createLimitOrder(BAT, 100, 10, SIDE.BUY, {
      from: trader1,
    });
    console.log('asdfads');
    // await debug(
    await dex.createMarketOrder(BAT, 100, SIDE.SELL, {
      from: trader2,
    });
    // );
    console.log('dai trader1', (await dai.balanceOf(trader1)).toString());
    console.log('dai trader2', (await dai.balanceOf(trader2)).toString());
    console.log('bat trader1', (await bat.balanceOf(trader1)).toString());
    console.log('bat trader2', (await bat.balanceOf(trader2)).toString());
  });

  describe('deposit', () => {
    it('should deposit tokens', async () => {
      const amount = web3.utils.toWei('100');
      await dex.deposit(amount, DAI, { from: trader1 });
      const balance = await dex.traderBalances(trader1, DAI);
      expect(balance.toString()).to.equal(amount);
    });

    it('should NOT deposit tokens if token does not exist', async () => {
      await expectRevert(
        dex.deposit(web3.utils.toWei('100'), ZRX, { from: trader1 }),
        'this token does not exist',
      );
    });
  });

  describe('withdraw', () => {
    it('should withdraw tokens', async () => {
      const amount = web3.utils.toWei('100');
      await dex.deposit(amount, DAI, { from: trader1 });
      await dex.withdraw(amount, DAI, { from: trader1 });
      const [balanceDex, balanceDai] = await Promise.all([
        dex.traderBalances(trader1, DAI),
        dai.balanceOf(trader1),
      ]);

      expect(balanceDex.isZero()).to.be.true;
      expect(balanceDai.toString()).to.equal(web3.utils.toWei('1000'));
    });

    it('should NOT withdraw tokens if token does not exist', async () => {
      await expectRevert(
        dex.withdraw(web3.utils.toWei('100'), ZRX, { from: trader1 }),
        'this token does not exist',
      );
    });

    it('should NOT withdraw tokens if token balance is too low', async () => {
      await dex.deposit(web3.utils.toWei('100'), DAI, { from: trader1 });
      await expectRevert(
        dex.withdraw(web3.utils.toWei('1000'), DAI, { from: trader1 }),
        'balance too low',
      );
    });
  });

  describe('createLimitOrder', () => {
    it('should create limit order', async () => {
      await dex.deposit(web3.utils.toWei('100'), DAI, { from: trader1 });
      await dex.createLimitOrder(BAT, web3.utils.toWei('10'), 10, SIDE.BUY, {
        from: trader1,
      });
      const buyOrders = await dex.getOrders(BAT, SIDE.BUY);
      const sellOrders = await dex.getOrders(BAT, SIDE.SELL);
      expect(buyOrders.length).to.equal(1);
      expect(sellOrders.length).to.equal(0);

      const [createdOrder] = buyOrders;
      expect(createdOrder.trader).to.equal(trader1);
      expect(createdOrder.ticker).to.equal(web3.utils.padRight(BAT, 64));
      expect(createdOrder.price).to.equal('10');
      expect(createdOrder.amount).to.equal(web3.utils.toWei('10'));
    });

    it('should keep the limit orders sorted', async () => {
      await dex.deposit(web3.utils.toWei('100'), DAI, { from: trader1 });
      await dex.createLimitOrder(BAT, web3.utils.toWei('10'), 10, SIDE.BUY, {
        from: trader1,
      });
      await dex.deposit(web3.utils.toWei('200'), DAI, { from: trader2 });
      await dex.createLimitOrder(BAT, web3.utils.toWei('10'), 11, SIDE.BUY, {
        from: trader2,
      });
      await dex.createLimitOrder(BAT, web3.utils.toWei('10'), 9, SIDE.BUY, {
        from: trader2,
      });

      const buyOrders = await dex.getOrders(BAT, SIDE.BUY);
      const sellOrders = await dex.getOrders(BAT, SIDE.SELL);
      expect(buyOrders.length).to.equal(3);
      expect(sellOrders.length).to.equal(0);

      const [firstOrder, secondOrder, thirdOrder] = buyOrders;
      expect(firstOrder.price).to.equal('11');
      expect(firstOrder.trader).to.equal(trader2);
      expect(secondOrder.price).to.equal('10');
      expect(secondOrder.trader).to.equal(trader1);
      expect(thirdOrder.price).to.equal('9');
      expect(thirdOrder.trader).to.equal(trader2);
    });

    it('should NOT create the limit order if the token does not exist', async () => {
      await expectRevert(
        dex.createLimitOrder(ZRX, web3.utils.toWei('10'), 10, SIDE.BUY, {
          from: trader1,
        }),
        'this token does not exist',
      );
    });

    it('should NOT create the limit order if the token is DAI', async () => {
      await expectRevert(
        dex.createLimitOrder(DAI, web3.utils.toWei('10'), 10, SIDE.BUY, {
          from: trader1,
        }),
        'cannot trade DAI',
      );
    });

    it('should NOT create the sell limit order if token balance is too low', async () => {
      await dex.deposit(web3.utils.toWei('99'), BAT, { from: trader1 });
      await expectRevert(
        dex.createLimitOrder(BAT, web3.utils.toWei('100'), 1, SIDE.SELL, {
          from: trader1,
        }),
        'token balance too low',
      );
      await dex.createLimitOrder(BAT, web3.utils.toWei('99'), 1, SIDE.SELL, {
        from: trader1,
      });
    });

    it('should NOT create the buy limit order if dai balance is too low', async () => {
      await dex.deposit(web3.utils.toWei('99'), DAI, { from: trader1 });
      await expectRevert(
        dex.createLimitOrder(BAT, web3.utils.toWei('100'), 1, SIDE.BUY, {
          from: trader1,
        }),
        'dai balance too low',
      );
      await dex.createLimitOrder(BAT, web3.utils.toWei('99'), 1, SIDE.BUY, {
        from: trader1,
      });
    });
  });

  describe('createMarketOrder', () => {
    it('creates and matches the market order', async () => {
      await dex.deposit(web3.utils.toWei('100'), DAI, { from: trader1 });
      await dex.createLimitOrder(REP, web3.utils.toWei('10'), 10, SIDE.BUY, {
        from: trader1,
      });

      await dex.deposit(web3.utils.toWei('100'), REP, { from: trader2 });
      await dex.createMarketOrder(REP, web3.utils.toWei('5'), SIDE.SELL, {
        from: trader2,
      });

      const [trader1Dai, trader1Rep, trader2Dai, trader2Rep] =
        await Promise.all([
          dex.traderBalances(trader1, DAI),
          dex.traderBalances(trader1, REP),
          dex.traderBalances(trader2, DAI),
          dex.traderBalances(trader2, REP),
        ]);
      const orders = await dex.getOrders(REP, SIDE.BUY);

      expect(orders[0].filled).to.equal(web3.utils.toWei('5'));
      expect(trader1Dai.toString()).to.equal(web3.utils.toWei('50'));
      expect(trader1Rep.toString()).to.equal(web3.utils.toWei('5'));
      expect(trader2Dai.toString()).to.equal(web3.utils.toWei('50'));
      expect(trader2Rep.toString()).to.equal(web3.utils.toWei('95'));
    });

    it('should NOT create market order if the token does not exist', async () => {
      await expectRevert(
        dex.createMarketOrder(ZRX, web3.utils.toWei('10'), SIDE.BUY, {
          from: trader1,
        }),
        'this token does not exist',
      );
    });

    it('should NOT create market order if the token is DAI', async () => {
      await expectRevert(
        dex.createMarketOrder(DAI, web3.utils.toWei('10'), SIDE.BUY, {
          from: trader1,
        }),
        'cannot trade DAI',
      );
    });

    it('should NOT create the sell market order if token balance is too low', async () => {
      await dex.deposit(web3.utils.toWei('99'), BAT, { from: trader1 });
      await expectRevert(
        dex.createMarketOrder(BAT, web3.utils.toWei('100'), SIDE.SELL, {
          from: trader1,
        }),
        'token balance too low',
      );
      await dex.createMarketOrder(BAT, web3.utils.toWei('99'), SIDE.SELL, {
        from: trader1,
      });
    });

    it('should NOT match the buy market order if dai balance is too low', async () => {
      await dex.deposit(web3.utils.toWei('100'), BAT, { from: trader1 });
      await dex.deposit(web3.utils.toWei('99'), DAI, { from: trader2 });

      await dex.createLimitOrder(BAT, web3.utils.toWei('100'), 1, SIDE.SELL, {
        from: trader1,
      });

      await expectRevert(
        dex.createMarketOrder(BAT, web3.utils.toWei('100'), SIDE.BUY, {
          from: trader2,
        }),
        'dai balance too low',
      );

      const [trader1Dai, trader1Bat, trader2Dai, trader2Bat] =
        await Promise.all([
          dex.traderBalances(trader1, DAI),
          dex.traderBalances(trader1, BAT),
          dex.traderBalances(trader2, DAI),
          dex.traderBalances(trader2, BAT),
        ]);

      expect(trader1Dai.toString()).to.equal(web3.utils.toWei('0'));
      expect(trader1Bat.toString()).to.equal(web3.utils.toWei('100'));
      expect(trader2Dai.toString()).to.equal(web3.utils.toWei('99'));
      expect(trader2Bat.toString()).to.equal(web3.utils.toWei('0'));
    });
  });
});
