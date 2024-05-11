const main = require('./__index');

const express = require('express');
const app = express();
app.use(express.json())

app.get('/data/:key', async (req, res) => {
  const key = req.params.key
  await main.sendMessageToQueue(key)
  res.send('Data request sent')
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API server listening on port ${port}`));
