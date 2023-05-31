const app = require('./server');
const server = require('http').createServer(app);

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`Сервер слушает на порту ${PORT}`);
});
