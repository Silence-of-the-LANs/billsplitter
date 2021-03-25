const { Friend } = require('../db/model/index');
const router = require('express').Router();

// api/friends/displayFriends route
router.get('/displayFriends', async (req, res, next) => {
  try {
    // const userId = req.session.user

    const friends = await Friend.findAll({
      where: {
        // userId: userId,
      },
    });

    res.json(friends);
  } catch (err) {
    next(err);
  }
});

// api/friends/addFriend route
router.post('/addFriend', async (req, res, next) => {
  try {
    const name = req.body.name;
    const email = req.body.email;
    const phone = req.body.phone;
    // const userId = req.session.user

    const [createdFriend] = await Friend.findOrCreate({
      where: {
        name: name,
        email: email,
        phone: phone,
        // userId: userId,
      },
    });

    res.json(createdFriend);
  } catch (err) {
    next(err);
  }
});

// api/friends/removeFriend/:friendId route
router.delete('/removeFriend/:friendId', async (req, res, next) => {
  try {
    // const userId = req.session.user

    const removedFriend = await Friend.destroy({
      where: {
        id: req.params.friendId,
        // userId: userId,
      },
    });

    const updatedFriends = await Friend.findAll({
      where: {
        // userId: userId,
      },
    });

    res.json(updatedFriends);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
