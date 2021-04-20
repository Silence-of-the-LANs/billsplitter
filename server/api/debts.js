const { Debt, Friend, Item, Receipt } = require('../db/model/index');
const router = require('express').Router();
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const getDebtsByFriend = async (userId) => {
  let resArray = [];
  // get a list of the user's friend's names and ids
  let listOfFriends = await Friend.findAll({
    where: {
      userId: userId,
      name: { [Op.notIn]: ['Myself'] },
    },
    order: [['name', 'ASC']],
  });

  // for each friend they have...
  for (let i = 0; i < listOfFriends.length; i++) {
    let currentFriend = listOfFriends[i];
    let total = await getFriendTotal(userId, currentFriend.id);

    // find all the receipts which they are part of...
    let receipts = await Receipt.findAll({
      attributes: ['id', 'date', 'eventName'],
      where: { userId: userId },
      include: [
        {
          model: Debt,
          where: {
            userId: userId,
            friendId: currentFriend.id,
          },
          order: [['friendId', 'ASC']],
          include: [
            {
              model: Item,
              attributes: ['id', 'description'],
              order: [['id', 'ASC']],
            },
          ],
        },
      ],
      order: [['eventName', 'ASC']],
    });

    // calculate the friend's total on each receipt and add it into the receipt object

    for (let j = 0; j < receipts.length; j++) {
      let currentReceipt = receipts[j];
      const friendTotal = await getFriendTotal(
        userId,
        currentFriend.id,
        currentReceipt.id
      );

      currentReceipt.dataValues.friendTotal = friendTotal;
    }

    // combine the friend's info and receipt info into an object and push add it to our response
    resArray.push({
      ...currentFriend.dataValues,
      total,
      receipts,
    });

    if (currentFriend.id == 58 || currentFriend.id == 57) {
      console.log(resArray[resArray.length - 1].receipts[0].dataValues);
    }
  }

  return resArray;
};

const getFriendTotal = async (userId, friendId, receiptId = null) => {
  let whereCondition = {
    userId: userId,
    paid: false,
    friendId: friendId,
  };

  if (receiptId) {
    whereCondition.receiptId = receiptId;
  }

  if (receiptId) {
    whereCondition.receiptId = receiptId;
  }

  let currentFriendBalance = await Debt.findAll({
    attributes: [
      [Sequelize.fn('SUM', Sequelize.col('balance')), 'totalBalance'],
      [Sequelize.fn('SUM', Sequelize.col('proratedTip')), 'totalProratedTip'],
      [Sequelize.fn('SUM', Sequelize.col('proratedTax')), 'totalProratedTax'],
    ],
    where: whereCondition,
  });

  let {
    totalBalance,
    totalProratedTip,
    totalProratedTax,
  } = currentFriendBalance[0].dataValues;

  let total =
    parseInt(totalBalance) +
    parseInt(totalProratedTip) +
    parseInt(totalProratedTax);

  if (isNaN(total)) {
    total = 0;
  }

  return total;
};

// api/debts/displayDebts/receipt route
router.get('/displayDebts/receipt', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;
      let friendsBalances;
      let resArr = [];

      // find the friendId of the User so we can omit that id from our queries (and so it does not show on our debts page)
      const friendIdOfUser = await Friend.findOne({
        attributes: ['id'],
        where: { userId: userId, name: 'Myself' },
      });

      // find all the receipts for this user
      let receipts = await Receipt.findAll({
        where: { userId: userId },
        order: [['eventName', 'ASC']],
      });

      let receiptItems;

      // for each receipt that belonged to the user
      for (let i = 0; i < receipts.length; i++) {
        let currentReceipt = receipts[i];
        currentReceipt.dataValues.friends = [];

        // find the balances associated with the current receipt
        receiptItems = await Debt.findAll({
          where: {
            receiptId: currentReceipt.id,
            friendId: { [Op.notIn]: [friendIdOfUser.id] },
          },
          order: [['friendId', 'ASC']],
        });

        // store the each friend's id found on this receipt to use for querying
        let friendsOnReceipt = [];

        receiptItems.forEach((item) => {
          if (!friendsOnReceipt.includes(item.friendId)) {
            friendsOnReceipt.push(item.friendId);
          }
        });

        // for each friend, find the items that belong to them on the current receipt
        for (let j = 0; j < friendsOnReceipt.length; j++) {
          let friendId = friendsOnReceipt[j];
          let friendInfo = await Friend.findByPk(friendId);

          // attach the friends information onto the current receipt
          currentReceipt.dataValues.friends.push(friendInfo);

          // grab the balances associated with that friend
          friendsBalances = await Item.findAll({
            where: { receiptId: currentReceipt.id },
            include: [
              {
                model: Debt,
                where: { receiptId: currentReceipt.id, friendId: friendId },
                order: [['friendId', 'ASC']],
              },
            ],
            order: [['id', 'ASC']],
          });

          // attach that friend's balance information to the friend's info
          friendInfo.dataValues.items = friendsBalances;
        }

        // add the receipt (now containing our extra friend and friend's balance data) to our response array
        resArr.push(currentReceipt);
      }

      res.json(resArr);
    }
  } catch (err) {
    next(err);
  }
});

// api/debts/displayDebts/friend route
router.get('/displayDebts/friend', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;
      const responseArray = await getDebtsByFriend(userId);

      res.send(responseArray);
    }
  } catch (err) {
    next(err);
  }
});

// api/debts/markPaid/:debtId route
router.put('/markPaid/:debtId', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;

      const debtId = parseInt(req.params.debtId);

      const debt = await Debt.findOne({
        where: { id: debtId, userId: userId },
        order: [['friendId', 'ASC']],
      });

      await debt.update({
        paid: !debt.paid,
      });

      res.send('Successfully paid item');
    }
  } catch (err) {
    next(err);
  }
});

// api/debts/markReceiptPaid/:receiptId route
router.put('/markReceiptPaid/:receiptId/:friendId', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;
      const friendId = parseInt(req.params.friendId);
      const receiptId = parseInt(req.params.receiptId);

      const debts = await Debt.update(
        { paid: true },
        {
          where: {
            receiptId: receiptId,
            friendId: friendId,
            userId: userId,
          },
        }
      );

      const responseArray = await getDebtsByFriend(userId);

      res.send(responseArray);
    }
  } catch (err) {
    next(err);
  }
});

// api/debts/getDebts/:receiptId/:friendId route
router.get('/getDebts/:receiptId/:friendId', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;
      const friendId = parseInt(req.params.friendId);
      const receiptId = parseInt(req.params.receiptId);

      const debts = await Debt.findAll({
        where: { receiptId: receiptId, friendId: friendId, userId: userId },
      });

      res.send(debts);
    }
  } catch (err) {
    next(err);
  }
});

// api/debts/markReceiptPaid/:receiptId route
router.put(
  '/markReceiptUnpaid/:receiptId/:friendId',
  async (req, res, next) => {
    try {
      if (!req.session.passport) {
        res.json('User is not logged in!');
      } else {
        const userId = req.session.passport.user;
        const friendId = parseInt(req.params.friendId);
        const receiptId = parseInt(req.params.receiptId);
        const debts = await Debt.update(
          {
            paid: false,
          },
          {
            where: {
              receiptId: receiptId,
              friendId: friendId,
              userId: userId,
            },
          }
        );

        // the response that we will store our information and send back
        const responseArray = await getDebtsByFriend(userId);

        res.send(responseArray);
      }
    } catch (err) {
      next(err);
    }
  }
);

// api/debts/total route
router.get('/total', async (req, res, next) => {
  try {
    if (!req.session.passport) {
      res.json('User is not logged in!');
    } else {
      const userId = req.session.passport.user;

      // grab the friendId that belongs to the user so we can omit their own debts
      const friendIdOfUser = await Friend.findOne({
        where: { userId: userId, name: 'Myself' },
      });

      // add up the balance, tip and tax in the Debt model for that user
      const debt = await Debt.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('balance')), 'totalBalance'],
          [
            Sequelize.fn('SUM', Sequelize.col('proratedTip')),
            'totalProratedTip',
          ],
          [
            Sequelize.fn('SUM', Sequelize.col('proratedTax')),
            'totalProratedTax',
          ],
        ],
        where: {
          userId: userId,
          paid: false,
          friendId: { [Op.notIn]: [friendIdOfUser.id] },
        },
      });

      let {
        totalBalance,
        totalProratedTip,
        totalProratedTax,
      } = debt[0].dataValues;

      // add it up and send it as our response
      let total =
        parseInt(totalBalance) +
        parseInt(totalProratedTip) +
        parseInt(totalProratedTax);

      if (isNaN(total)) {
        total = 0;
      }

      // ... will break if we do not send it in this format
      res.send(`${total}`);
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
