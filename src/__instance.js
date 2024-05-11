const amqpServerInterface = require('./amqpServerInterface');

let currentNode;
let nodeTable = [];
let valueTable = {};

const generateRandomName = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name = '';
  for (let i = 0; i < 10; i++) {
    name += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return name;
}

const start = async () => {
  const id = Number(process.argv[2]);
  const role = (id % 2 === 0) ? "hasher" : "receiver";
  currentNode = {
    id,
    name: generateRandomName(),
    role
  };

  try {
    const connection = await amqpServerInterface.connect();
    const channel = await connection.createChannel();

    await channel.assertExchange('node_topic', 'topic', { durable: true });

    await channel.consume('node_queue', message => {
      const data = JSON.parse(message.content.toString());
      console.log(`Node ${currentNode.id} received message:`, data);

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
        channel.publish('node_topic', `node.${message.properties.replyTo}`, Buffer.from(JSON.stringify(replyData)));
      } else if (data.type === 'data') {
        if (currentNode.role === 'receiver') {
          // Store data in value table
          const key = data.value?.substring(0, 10);
          valueTable[key] = data.value;
          console.log(`Node ${currentNode.id} stored data with key ${key}`);
          replicateData(key, data.value);
        } else if (currentNode.role === 'hasher') {
          // Calculate hash and send data to the right peer
          const hash = calculateHash(data.value?.substring(0, 10));
          const peerId = hash % nodeTable.length;
          channel.publish('node_topic', `node.${peerId}`, Buffer.from(JSON.stringify(data)));
          console.log(`Node ${currentNode.id} sent data to node id ${peerId}, hash ${hash}, tableLength ${nodeTable.length}, key ${data.value?.substring(0, 10)}`);
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
    channel.publish('node_topic', 'node.*', Buffer.from(JSON.stringify(joinMessage))); // Broadcast to all nodes
    for (const node of nodeTable) {
      channel.publish('node_topic', `node.${node.id}`, Buffer.from(JSON.stringify(joinMessage)));
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
        console.log(`Node ${currentNode.id} received message:`, data);

        if (data.type === 'data') {
          // Store data in value table
          const key = data.value?.substring(0, 10);
          valueTable[key] = data.value;
          console.log(`Node ${currentNode.id} stored data with key ${key}`);
          replicateData(key, data.value);
        } else if (data.type === 'retrieve') {
          // Relay retrieval request to a hasher node
          const hash = calculateHash(data.value?.substring(0, 10));
          const peerId = hash % nodeTable.length;
          channel.publish('node_topic', `node.${peerId}`, Buffer.from(JSON.stringify(data)));
          console.log(`Node ${currentNode.id} relayed retrieval request to node ${peerId}`);
        }

        channel.ack(message);
      });
    } else if (currentNode.role === 'hasher') {
      await channel.consume('node_queue', message => {
        const data = JSON.parse(message.content.toString());
        console.log(`Node ${currentNode.id} received message:`, data);

        if (data.type === 'data') {
          // Calculate hash and send data to the right peer
          const hash = calculateHash(data.value?.substring(0, 10));
          const peerId = hash % nodeTable.length;
          channel.publish('node_topic', `node.${peerId}`, Buffer.from(JSON.stringify(data)));
          console.log(`Node ${currentNode.id} sent data to node id ${peerId}`);
        } else if (data.type === 'retrieve') {
          // Send data back to the receiver node
          const key = data.value?.substring(0, 10);
          const replyData = {
            type: 'data',
            key,
            value: valueTable[key]
          };
          channel.publish('node_topic', `node.${data.senderNodeId}`, Buffer.from(JSON.stringify(replyData)));
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

// Rest of the code remains the same

start();
