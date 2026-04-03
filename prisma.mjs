import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prisma = require('./client/index.js');

export const Prisma = prisma.Prisma;
export const PrismaClient = prisma.PrismaClient;
export const $Enums = prisma.$Enums;
export default prisma;
