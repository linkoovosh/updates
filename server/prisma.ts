import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export const prisma = new PrismaClient();

// Подключение к базам данных при старте
export async function connectPrisma() {
  await prisma.$connect();
  console.log('Prisma Client connected.');
}

// Отключение от баз данных при остановке
export async function disconnectPrisma() {
  await prisma.$disconnect();
  console.log('Prisma Client disconnected.');
}