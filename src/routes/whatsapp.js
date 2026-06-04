const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const whatsapp = require('../services/whatsapp');

const router = express.Router();
router.use(auth);

router.get('/status', requireRole('administrador'), async (req, res, next) => {
  try {
    res.json(whatsapp.getStatus());
  } catch (error) {
    next(error);
  }
});

router.post('/start', requireRole('administrador'), async (req, res, next) => {
  try {
    res.json(await whatsapp.startAndWaitForQr());
  } catch (error) {
    next(error);
  }
});

router.post('/reset', requireRole('administrador'), async (req, res, next) => {
  try {
    res.json(await whatsapp.resetSession());
  } catch (error) {
    next(error);
  }
});

router.post('/send', requireRole('administrador'), async (req, res, next) => {
  try {
    const result = await whatsapp.sendText({
      phone: req.body.phone,
      jid: req.body.jid,
      message: req.body.message,
      userId: req.user.id
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/conversations', requireRole('administrador'), (req, res) => {
  res.json(whatsapp.listConversations());
});

router.get('/messages/:jid', requireRole('administrador'), (req, res) => {
  res.json(whatsapp.listMessages(req.params.jid));
});

router.post('/messages/:jid/read', requireRole('administrador'), (req, res) => {
  res.json(whatsapp.markConversationRead(req.params.jid));
});

module.exports = router;
