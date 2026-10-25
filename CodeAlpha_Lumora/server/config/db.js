const mongoose = require('mongoose');

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set. Copy .env.example to .env first.');
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, { dbName: process.env.DB_NAME || 'main' });
  console.log(`✦ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
};