-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "discriminator" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "token" TEXT,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "bio" TEXT,
    "profile_banner" TEXT,
    "profile_theme" TEXT DEFAULT 'holographic',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationCode" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "description" TEXT,
    "banner" TEXT,
    "systemChannelId" TEXT,
    "verificationLevel" INTEGER NOT NULL DEFAULT 0,
    "avatar_default" TEXT,
    "avatar_active" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" BIGINT
);

-- CreateTable
CREATE TABLE "server_bans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "executorId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    CONSTRAINT "server_bans_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "slowMode" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "channels_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "server_members" (
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "joinedAt" BIGINT,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("userId", "serverId"),
    CONSTRAINT "server_members_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "server_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "permissions" TEXT,
    "position" INTEGER,
    CONSTRAINT "roles_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT,
    "authorId" TEXT NOT NULL,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" BIGINT,
    "defaultRoleId" TEXT,
    "temporary" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT
);

-- CreateTable
CREATE TABLE "friends" (
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" BIGINT,

    PRIMARY KEY ("user1Id", "user2Id")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "read" INTEGER NOT NULL DEFAULT 0,
    "attachments" TEXT
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatar" TEXT,
    "content" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "attachments" TEXT,
    "audioData" TEXT
);

-- CreateTable
CREATE TABLE "user_read_states" (
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadTimestamp" BIGINT,

    PRIMARY KEY ("userId", "channelId")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" BIGINT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");
