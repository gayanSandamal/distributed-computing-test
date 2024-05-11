const amqpServerInterface = require('./amqpServerInterface')

let currentNode;
let nodeTable = [];
let valueTable = {};

const start = async () => {
  const id = Number(process.argv[2]);
  const role = (id % 2  === 0) ? "hasher" : "receiver";
  currentNode = {
    id,
    name: generateRandomName(),
    role
  };

  try {
    const connection = await amqpServerInterface.connect();
    const channel = await connection.createChannel();

    await channel.assertQueue('node_queue', { durable: true });

    await channel.consume('node_queue', message => {
      const data = JSON.parse(message.content.toString());
      console.log(`Node ${currentNode.id} received message:`, data);
      console.log('Current node role:', currentNode.role);
      
      // Add the node to the node table
      nodeTable.push({
        id: currentNode.id,
        name: currentNode.name,
        role: currentNode.role
      });

      if (data.type === 'join') {
        // Reply back with node id and name
        const replyData = {
          type: 'reply',
          nodeId: currentNode.id,
          nodeName: currentNode.name
        };
        channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(replyData)));
      } else if (data.type === 'data') {
        if (currentNode.role === 'receiver') {
          // Store data in value table
          const id = data.key.toLowerCase().substring(0, 10)
          valueTable[id] = data.key;
          console.log(`Node ${currentNode.id} stored data with key ${data.key}`);
          console.table(valueTable);
        } else if (currentNode.role === 'hasher') {
          // Calculate hash and send data to the right peer
          const hash = calculateHash(data.key);
          sendDataToNode(channel, data);
          console.log(`Node ${currentNode.id} sent data to node id ${currentNode.id}, hash ${hash}, tableLength ${nodeTable.length}, key ${data.key}`);
        }
      }

      channel.ack(message);
    });

    console.table(nodeTable);
    // Send join message to all connected peers
    const joinMessage = {
      type: 'join',
      nodeName: currentNode.name
    };
    console.log(joinMessage);
    sendDataToNode(channel, joinMessage);
    for (const node of nodeTable) {
      await channel.sendToQueue('node_queue', Buffer.from(JSON.stringify(joinMessage)), {
        replyTo: `node_${node.id}`
      });
    }

    // Wait for replies from peers
    const replyPromises = nodeTable.map(node => {
      return new Promise(resolve => {
        channel.consume(`node_${node.id}`, replyMessage => {
          const replyData = JSON.parse(replyMessage.content.toString());
          console.log(`Node ${currentNode.id} received reply from node ${node.id}:`, replyData);
          nodeTable.push({
            id: replyData.nodeId,
            name: replyData.nodeName
          });
          channel.ack(replyMessage);
          resolve();
        });
      });
    });
    await Promise.all(replyPromises);

    // Determine role based on the number of nodes
    console.log(`Node ${currentNode.id} assigned role: ${currentNode.role}`);

    // Start consuming messages based on the role
    if (currentNode.role === 'receiver') {
      await channel.consume('node_queue', message => {
        const data = JSON.parse(message.content.toString());
        if (data.type === 'data') {
          // Store data in value table
          const id = data.key.toLowerCase().substring(0, 10)
          valueTable[id] = data.key || 'test2';
          console.table(valueTable);
        } else if (data.type === 'retrieve') {
          // Relay retrieval request to a hasher node
          const hash = calculateHash(data.key);
          console.log('test2');
          sendDataToNode(channel, data);
          console.log(`Node ${currentNode.id} relayed retrieval request to node ${currentNode.id}`);
        }

        channel.ack(message);
      });
    } else if (currentNode.role === 'hasher') {
      await channel.consume('node_queue', message => {
        const data = JSON.parse(message.content.toString());
        console.log(`Node ${currentNode.id} received message:`, data);

        if (data.type === 'data') {
          // Calculate hash and send data to the right peer
          const hash = calculateHash(data.key);
          console.log('test3');
          sendDataToNode(channel, data);
          console.log(`Node ${currentNode.id} sent data to node hash 2 ${currentNode.id}`);
        } else if (data.type === 'retrieve') {
          // Send data back to the receiver node
          const replyData = {
            type: 'data',
            key: data.key,
            value: valueTable[data.key]
          };
          console.log('test4');
          sendDataToNode(channel, replyData);
          console.log(`Node ${currentNode.id} sent data back to node ${data.senderNodeId}`);
        }

        channel.ack(message);
      });
    } else {
      console.error('Invalid role. Please specify receiver or hasher');
      process.exit(1);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

function calculateHash(key) {
  return key.toLowerCase().substring(0, 10).split('').reduce((hash, char) => hash + char.charCodeAt(0), 0) % 5;
}

const sendDataToNode = async (channel, data) => {
  // console.log('nodeId', nodeId);
  // const queueName = `node_${nodeId}`;
  // await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue('node_queue', Buffer.from(JSON.stringify(data)), { persistent: true });
};

const generateRandomName = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name = '';
  for (let i = 0; i < 10; i++) {
    name += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return name;
}

start();
