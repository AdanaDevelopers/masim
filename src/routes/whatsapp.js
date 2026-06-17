const express = require('express');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');
const whatsapp = require('../services/whatsapp');

const router = express.Router();
router.use(auth);

router.get('/status', checkPermission('whatsapp', 'r'), async (req, res, next) => {
  try {
    res.json(whatsapp.getStatus());
  } catch (error) {
    next(error);
  }
});

router.post('/start', checkPermission('whatsapp', 'u'), async (req, res, next) => {
  try {
    logAction(req.user.id, 'UPDATE', 'whatsapp', 'Servicio de WhatsApp iniciado', req.ip);
    res.json(await whatsapp.startAndWaitForQr());
  } catch (error) {
    next(error);
  }
});

router.post('/reset', checkPermission('whatsapp', 'u'), async (req, res, next) => {
  try {
    logAction(req.user.id, 'UPDATE', 'whatsapp', 'Sesión de WhatsApp reiniciada', req.ip);
    res.json(await whatsapp.resetSession());
  } catch (error) {
    next(error);
  }
});

router.post('/send', checkPermission('whatsapp', 'c'), async (req, res, next) => {
  try {
    const result = await whatsapp.sendText({
      phone: req.body.phone,
      jid: req.body.jid,
      message: req.body.message,
      userId: req.user.id
    });
    const destination = req.body.phone || req.body.jid || '';
    logAction(req.user.id, 'CREATE', 'whatsapp', `Mensaje enviado a ${destination}: "${req.body.message ? req.body.message.substring(0, 50) + '...' : ''}"`, req.ip);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/conversations', checkPermission('whatsapp', 'r'), (req, res) => {
  res.json(whatsapp.listConversations());
});

router.get('/messages/:jid', checkPermission('whatsapp', 'r'), (req, res) => {
  res.json(whatsapp.listMessages(req.params.jid));
});

router.post('/messages/:jid/read', checkPermission('whatsapp', 'u'), (req, res) => {
  res.json(whatsapp.markConversationRead(req.params.jid));
});

module.exports = router;
