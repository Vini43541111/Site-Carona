require('dotenv').config();
const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'postgres';

let sequelize;
if (dialect === 'sqlite') {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: './caronauni.sqlite', logging: false });
} else if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'caronauni',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASS || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false,
    }
  );
}

module.exports = sequelize;