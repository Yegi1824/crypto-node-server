const app = require('./server');
const server = require('http').createServer(app);
const io = require('./socket').initSocketIO(server); // Передаем сервер в socket.js

const PORT = 443;

server.listen(PORT, () => {
  console.log(`Сервер слушает на порту ${PORT}`);
});