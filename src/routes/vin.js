const express = require('express');
const auth = require('../middleware/auth');
const { decodeVin } = require('../services/vinDecoder');

const router = express.Router();
router.use(auth);

router.get('/decode/:vin', async (req, res, next) => {
  try {
    res.json(await decodeVin(req.params.vin));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
