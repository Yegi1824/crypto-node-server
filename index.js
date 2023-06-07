const app = require('./server');
const server = require('http').createServer(app);

const mongoose = require('mongoose');

// Connect to MongoDB
const uri = 'mongodb+srv://yegizavr:yegizavr123@cluster0.rgzhbcz.mongodb.net/?retryWrites=true&w=majority';
mongoose.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true});

const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB database connection established successfully');
  const io = require('./socket').initSocketIO(server); // Передаем сервер в socket.js
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`Сервер слушает на порту ${PORT}`);
});