const express = require('express');
const { requireApiAuth } = require('../middleware/auth');
const { RemoteInputError, normalizeRdpInput } = require('../services/remote_validation');

const router = express.Router();
router.use(requireApiAuth);

function rdpFile({ host, port, username, domain }) {
  const lines = [
    `full address:s:${host}:${port}`,
    `username:s:${username}`,
    'prompt for credentials:i:1',
    'authentication level:i:2',
    'screen mode id:i:2',
    'desktopwidth:i:1440',
    'desktopheight:i:900',
    'redirectclipboard:i:1',
  ];
  if (domain) lines.splice(2, 0, `domain:s:${domain}`);
  return `${lines.join('\r\n')}\r\n`;
}

router.post('/download', (req, res) => {
  try {
    const data = normalizeRdpInput(req.body);
    res
      .type('application/x-rdp')
      .set('Content-Disposition', 'attachment; filename="liulianbot-remote.rdp"')
      .send(rdpFile(data));
  } catch (err) {
    if (err instanceof RemoteInputError) return res.status(err.statusCode).json({ error: err.message });
    console.error('[RDP] Failed to create RDP file:', err);
    return res.status(500).json({ error: 'Failed to create RDP file' });
  }
});

router.rdpFile = rdpFile;
module.exports = router;
