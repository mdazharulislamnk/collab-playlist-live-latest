let clients = [];
let clientIdSeed = 1;

// Monotonic event id for dedup/out-of-order handling on the client
let eventId = 0;

function addClient(res) {
  const id = clientIdSeed++;
  clients.push({ id, res });
  return id;
}

function removeClient(id) {
  clients = clients.filter((c) => c.id !== id);
}

function nextEventId() {
  eventId += 1;
  return eventId;
}

function broadcast(event) {
  const envelope = {
    eventId: nextEventId(),
    ...event
  };
  const data = `data: ${JSON.stringify(envelope)}\n\n`;
  clients.forEach((c) => c.res.write(data));
  return envelope;
}

function sendPing(res) {
  const payload = { type: 'ping', ts: new Date().toISOString() };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = {
  addClient,
  removeClient,
  broadcast,
  sendPing
};