import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default {
  dialect: 'mysql',
  schema: './src/_schemas/schema.ts',
  out: './src/_schemas/migrations',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'salvemaisum_dev',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
} satisfies Config;
