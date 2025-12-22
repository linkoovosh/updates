export const PERMISSIONS = {
  NONE: 0n,
  // General
  ADMINISTRATOR: 1n << 0n,          // 1
  MANAGE_SERVER: 1n << 1n,          // 2
  MANAGE_ROLES: 1n << 2n,           // 4
  MANAGE_CHANNELS: 1n << 3n,        // 8
  KICK_MEMBERS: 1n << 4n,           // 16
  BAN_MEMBERS: 1n << 5n,            // 32
  CREATE_INVITE: 1n << 6n,          // 64
  CHANGE_NICKNAME: 1n << 7n,        // 128
  MANAGE_NICKNAMES: 1n << 8n,       // 256
  
  // Text
  SEND_MESSAGES: 1n << 9n,          // 512
  EMBED_LINKS: 1n << 10n,           // 1024
  ATTACH_FILES: 1n << 11n,          // 2048
  READ_MESSAGE_HISTORY: 1n << 12n,  // 4096
  MENTION_EVERYONE: 1n << 13n,      // 8192
  MANAGE_MESSAGES: 1n << 14n,       // 16384 (Delete/Edit others)
  
  // Voice
  CONNECT: 1n << 15n,               // 32768
  SPEAK: 1n << 16n,                 // 65536
  MUTE_MEMBERS: 1n << 17n,          // 131072
  DEAFEN_MEMBERS: 1n << 18n,        // 262144
  MOVE_MEMBERS: 1n << 19n,          // 524288
  USE_VAD: 1n << 20n,               // 1048576 (Voice Activity Detection)
  
  // Advanced
  PRIORITY_SPEAKER: 1n << 21n,      // 2097152
  STREAM: 1n << 22n                 // 4194304
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((acc, val) => acc | val, 0n);

// Helper to check permission
export function hasPermission(userPermissions: string | bigint | null, permission: bigint): boolean {
  const perms = BigInt(userPermissions || 0n);
  
  // Administrator overrides everything
  if ((perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) {
    return true;
  }
  
  return (perms & permission) === permission;
}

export function serializePermissions(perms: bigint): string {
    return perms.toString();
}
