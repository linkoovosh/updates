export const generateAvatarColor = (username: string): string => {
  if (!username) return '#808080'; // Default gray for undefined users
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

export const getInitials = (username: string): string => {
  if (!username) return '?';
  return username.charAt(0).toUpperCase();
};
