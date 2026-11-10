import { FactoryProvider, Logger } from '@nestjs/common';
import { DefaultLogger, LogWriter } from 'drizzle-orm';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from '../_schemas/schema';

export const DB_SERVICE = 'DB_SERVICE';
export type DbType = MySql2Database<typeof schema> & { $client: mysql.Pool };

export const DbProvider: FactoryProvider = {
  provide: DB_SERVICE,
  useFactory: async () => {
    const logger = new Logger('DB');
    logger.debug('Connecting to MySQL...');

    const connection = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'salvemaisum_dev',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
    });
    // enquanto as datas geradas na API vão em UTC, e as duas aparecem com 3h de diferença
    connection.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));

    logger.debug('Connected to MySQL!');

    class CustomDbLogWriter implements LogWriter {
      write(message: string) {
        // logger.verbose(message);
      }
    }

    return drizzle(connection, {
      schema,
      mode: 'default',
      logger: new DefaultLogger({ writer: new CustomDbLogWriter() }),
    });
  },
};
