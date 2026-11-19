import 'dotenv/config';
import mariadb from 'mariadb';
const pool = mariadb.createPool({
  host:process.env.DB_HOST || '127.0.0.1',
  port:Number(process.env.DB_PORT || 3306),
  user:process.env.DB_USER || 'loudent_app',
  password:process.env.DB_PASSWORD || '',
  database:process.env.DB_NAME || 'loudent',
  connectionLimit:8,
  insertIdAsNumber:true,
  bigIntAsNumber:true,
});
export default pool;
