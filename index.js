const app = require('./server');
const server = require('http').createServer(app);
const io = require('./socket').initSocketIO(server); // Передаем сервер в socket.js

const PORT = 3001;

app.listen(PORT, '0.0.0.0', function() {
  console.log(`Server listening on port ${port}`);
});