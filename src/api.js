const express = require('express');
const amqp = require('amqplib');

const app = express();
app.use(express.json())
const RABBITMQ_URL = 'amqp://rabbitMQ:5672';

let channel; // Declare the channel variable outside the connectToRabbitMQ function

async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel(); // Assign the channel to the variable
    await channel.assertQueue('node_queue', { durable: true });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

app.get('/data/:key', async (req, res) => {
  const key = req.params.key;

  // FAULT TOLERANCE: Check if the channel is already established
  await connectToRabbitMQ(); // Connect to RabbitMQ if the channel is not yet established
  try {
    if (!channel) { 
      await connectToRabbitMQ(); // Connect to RabbitMQ if the channel is not yet established
    }

    // Send a data request message to all connected nodes
    const dataRequest = {
      type: 'data',
      key: key
    };
    channel.sendToQueue('node_queue', Buffer.from(JSON.stringify(dataRequest)), { persistent: true });

    // Wait for a response from any of the nodes
    channel.consume('node_queue', async (message) => {
      const data = JSON.parse(message.content.toString());
      if (data.type === 'data' && data.key === key) {
        // Received the requested data from a node
        res.send('Received data response: ' + data);
        channel.ack(message); // Acknowledge the message
        clearTimeout(noDataTimeout); // Clear the timeout
      }
    });

    // Set a timeout to handle cases where no response is received
    const noDataTimeout = setTimeout(() => {
      res.send('No data found');
    }, 5000);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error sending data request');
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API server listening on port ${port}`));
