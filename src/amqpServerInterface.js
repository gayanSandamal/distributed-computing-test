const amqp = require('amqplib');

const RABBITMQ_URL = 'amqp://localhost:5672';
const connection = amqp.connect(RABBITMQ_URL)

function connect() {
  return connection
}

module.exports = {
  connect
}