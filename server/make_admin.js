import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = '8db4e5ad-0e90-4c8a-a1d9-9ba61f338a0e'; // ID LINKO#3246
  const serverId = 'public-default-server';

  console.log(`Checking server ${serverId}...`);
  const server = await prisma.server.findUnique({ where: { id: serverId } });

  if (!server) {
    console.error('Server "Public Lobby" not found in database. Maybe it was already deleted?');
    return;
  }

  console.log(`Transferring ownership of "${server.name}" to user ${userId}...`);
  
  await prisma.server.update({
    where: { id: serverId },
    data: { ownerId: userId }
  });

  // Ensure user is a member
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId, serverId } },
    update: {},
    create: { userId, serverId, joinedAt: BigInt(Date.now()) }
  });

  console.log('Done! You are now the owner of the server.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
