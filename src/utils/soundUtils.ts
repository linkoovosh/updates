export const playSound = (path: string, volume: number = 0.5) => {
    try {
        const audio = new Audio(path);
        audio.volume = volume;
        audio.play().catch(e => {
            // Silence common errors like "user didn't interact yet"
            if (e.name !== 'NotAllowedError') {
                console.error("Failed to play sound:", path, e);
            }
        });
    } catch (e) {
        console.error("Sound system error:", e);
    }
};

export const playHoverSound = () => {
    playSound('./sounds/hover.wav', 0.01); // Minimal volume (1%)
};

export const playChatNotify = () => {
    playSound('./sounds/chat_notify.mp3', 0.4);
};

export const playDmNotify = () => {
    playSound('./sounds/dm_notify.mp3', 0.5);
};

export const playScreenshareStart = () => {
    playSound('./sounds/screenshare_start.wav', 0.5);
};
