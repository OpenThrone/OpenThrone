import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';

// This loads your .env file into process.env
dotenv.config();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? '',
  },
});
