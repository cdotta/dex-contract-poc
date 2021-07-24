const { expectRevert } = require('@openzeppelin/test-helpers');
const Dai = artifacts.require('mocks/Dai.sol');
const Bat = artifacts.require('mocks/Bat.sol');
const Rep = artifacts.require('mocks/Rep.sol');
const Zrx = artifacts.require('mocks/Zrx.sol');
const Dex = artifacts.require('Dex.sol');

contract('Dex', (accounts) => {
  let dai, bat, rep, zrx, dex;
  const [admin, trader1, trader2] = accounts;
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
});
