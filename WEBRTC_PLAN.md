# Детальный план реализации голосового чата (WebRTC) в MurChat

## Этап 7: WebRTC - Бэкенд (Сигнальный сервер)

1.  **Обновить `common/types.ts`:**
    *   Добавить новые `enum` для типов сообщений WebRTC-сигналинга:
        *   `C2S_WEBRTC_MSG_TYPE` (JOIN_VOICE_CHANNEL, LEAVE_VOICE_CHANNEL, OFFER, ANSWER, ICE_CANDIDATE)
        *   `S2C_WEBRTC_MSG_TYPE` (USER_JOINED_VOICE, USER_LEFT_VOICE, OFFER, ANSWER, ICE_CANDIDATE)
    *   Обновить `WebSocketMessage<T>` для включения новых типов.
    *   Добавить интерфейсы для `payload` этих сообщений (например, `JoinVoiceChannelPayload`, `WebRTCOfferPayload` и т.д.).
2.  **Модифицировать `server/index.ts`:**
    *   Добавить структуру для хранения пользователей по голосовым каналам (например, `Map<string, Set<WebSocket>>`).
    *   Реализовать логику обработки `C2S_WEBRTC_JOIN_VOICE_CHANNEL`: добавить пользователя в "комнату", присвоить ему `userId` и оповестить остальных в этой комнате (`S2C_WEBRTC_USER_JOINED`).
    *   Реализовать логику обработки `C2S_WEBRTC_LEAVE_VOICE_CHANNEL`: удалить пользователя из "комнаты" и оповестить остальных (`S2C_WEBRTC_USER_LEFT`).
    *   Реализовать логику ретрансляции (forwarding) сообщений `OFFER`, `ANSWER`, и `ICE_CANDIDATE` между клиентами в одной "комнате", используя `targetUserId` и `senderUserId`.

## Этап 8: WebRTC - Фронтенд (Клиентская логика)

3.  **Создать `src/services/webrtc.ts`:**
    *   Создать класс `WebRTCService`, который будет управлять WebRTC-соединениями.
    *   Метод `joinChannel(channelId: string, userId: string)`:
        *   Запрашивает доступ к микрофону (`navigator.mediaDevices.getUserMedia`).
        *   Отправляет `C2S_WEBRTC_JOIN_VOICE_CHANNEL` на сервер.
        *   Получает список активных пиров в канале от сервера.
        *   Для каждого другого пира создает `RTCPeerConnection`.
        *   Добавляет локальный медиапоток (от микрофона) в каждый `RTCPeerConnection`.
        *   Настраивает обработчики:
            *   `onicecandidate`: для отправки ICE-кандидатов на сервер через WebSocket.
            *   `ontrack`: для получения аудиопотока от другого пира и его прикрепления к `<audio>` элементу.
    *   Метод `leaveChannel(channelId: string, userId: string)`:
        *   Отключает локальный медиапоток.
        *   Закрывает все `RTCPeerConnection`s.
        *   Отправляет `C2S_WEBRTC_LEAVE_VOICE_CHANNEL` на сервер.
    *   Методы для обработки сигналов `OFFER`, `ANSWER`, `ICE_CANDIDATE` от WebSocketService.
4.  **Интегрировать `WebRTCService` с `WebSocketService`:**
    *   `WebSocketService` будет передавать полученные сигнальные сообщения (`S2C_WEBRTC_...`) в `WebRTCService`.
    *   `WebRTCService` будет использовать `webSocketService.sendMessage` для отправки сигнальных сообщений (`C2S_WEBRTC_...`) на сервер.
5.  **Модифицировать `ChannelPanel.tsx`:**
    *   При клике на голосовой канал (`isVoice: true`) пользователя, вызывать `webRTCService.joinChannel(channelId, userId)`.
    *   При клике на другой канал (текстовый или другой голосовой), вызывать `webRTCService.leaveChannel(currentVoiceChannelId, userId)`.
    *   Визуально отображать статус подключения к голосовому каналу (например, иконка микрофона).
6.  **Создать `src/components/VoiceManager.tsx`:**
    *   Создать новый компонент, который будет отвечать за рендеринг `<audio>` элементов для каждого активного голосового потока, полученного через WebRTC.
    *   Этот компонент будет получать список активных потоков (например, через Redux).
7.  **Расширить Redux-хранилище (`uiSlice.ts`):**
    *   Добавить в состояние `UiState` информацию об активном голосовом канале (`activeVoiceChannelId: string | null`) и список участников в нем (`voiceChannelParticipants: { userId: string, username: string, stream: MediaStream | null }[]`).
    *   Добавить новые редьюсеры для управления этим состоянием (например, `userJoinedVoice`, `userLeftVoice`, `setActiveVoiceChannel`, `addRemoteStream`).
