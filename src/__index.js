const amqpServerInterface = require('./amqpServerInterface')

const amqp = require("amqplib");
let channel, connection;

const exchange_name = 'test-exchange';
const exchange_type = 'fanout';

connectQueue() // call connectQueue function

async function connectQueue() {
  try {
    connection = await amqpServerInterface.connect();
    channel = await connection.createChannel();

    await channel.assertExchange(exchange_name, exchange_type, {
      durable: false
    })

  } catch (error) {
    console.log(error)
  }
}

const sendMessageToQueue = async (message) => {
  const queue_name = '';
  await channel.publish(
    exchange_name,
    queue_name,
    Buffer.from(message)
  );
}

module.exports = {
  sendMessageToQueue
}