const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const adminSchema = new Schema({
  sEmail: {type: String, required: true, unique: true, trim: true},
  sPassword: {type: String, required: true, trim: true},
});

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
