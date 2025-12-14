import { api } from './api';

export type CallLogStatus = 'outgoing' | 'missed' | 'completed' | 'declined';
export type CallType = 'audio' | 'video';

export interface CallLogMessageData {
  sender: string;
  receiver: string;
  callType: CallType;
  status: CallLogStatus;
  duration?: number; // Duration in seconds (only for completed calls)
  callId: string;
}

/**
 * Formats call log message text based on status and type
 */
export const formatCallLogText = (
  callType: CallType,
  status: CallLogStatus,
  duration?: number
): string => {
  const icon = callType === 'video' ? '🎥' : '📞';
  
  switch (status) {
    case 'outgoing':
      return callType === 'video' 
        ? '🎥 Outgoing video call' 
        : '📞 Outgoing call';
    
    case 'missed':
      return callType === 'video' 
        ? 'Missed video call' 
        : 'Missed voice call';
    
    case 'completed':
      if (duration !== undefined) {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        
        let durationText = '';
        if (hours > 0) {
          durationText = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        return `Call ended • Duration: ${durationText}`;
      }
      return 'Call ended';
    
    case 'declined':
      return 'Call declined';
    
    default:
      return `${icon} Call`;
  }
};

/**
 * Sends a call log message to the chat
 * This creates a special system message that doesn't require encryption
 */
export const sendCallLogMessage = async (data: CallLogMessageData): Promise<void> => {
  try {
    // CRITICAL: Validate sender and receiver are valid before sending
    if (!data.sender || !data.receiver) {
      console.error('❌ Invalid call log data - missing sender or receiver:', data);
      return;
    }
    
    if (data.sender === data.receiver) {
      console.error('❌ Invalid call log data - sender and receiver are the same:', data);
      return;
    }
    
    const messageText = formatCallLogText(data.callType, data.status, data.duration);
    
    console.log('📞 Sending call log message:', {
      sender: data.sender,
      receiver: data.receiver,
      callType: data.callType,
      status: data.status,
      callId: data.callId,
      messageText
    });
    
    // Create a special call log message payload
    // We'll use a special format that the backend can recognize
    const messagePayload = {
      sender: data.sender,
      receiver: data.receiver,
      ciphertext: JSON.stringify({
        type: 'call-log',
        callType: data.callType,
        status: data.status,
        duration: data.duration,
        callId: data.callId,
        text: messageText
      }),
      type: 'ratcheted',
      contentType: 'call-log', // Special content type for call logs
      encryptedKey: 'call-log-no-encryption', // Special flag
      senderEncryptedKey: 'call-log-no-encryption', // Special flag
      isGroup: false
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(messagePayload));

    await api.post('/messages/send', formData, {
      timeout: 10000,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    console.log('✅ Call log message sent:', messageText);
  } catch (error) {
    console.error('❌ Failed to send call log message:', error);
    // Don't throw - call log messages are non-critical
  }
};

