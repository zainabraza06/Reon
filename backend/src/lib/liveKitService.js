import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

class LiveKitService {
  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY;
    this.apiSecret = process.env.LIVEKIT_API_SECRET;
    this.livekitHost = process.env.LIVEKIT_URL;
    
    // Validation
    if (!this.apiKey || !this.apiSecret) {
      console.error('❌ LiveKit API key or secret missing!');
      console.log('\n=== GET YOUR KEYS ===');
      console.log('1. Go to: https://cloud.livekit.io');
      console.log('2. Create project');
      console.log('3. Go to Project Settings → API Keys');
      console.log('4. Generate new key');
      console.log('5. Add to .env:');
      console.log('   LIVEKIT_API_KEY=your_key');
      console.log('   LIVEKIT_API_SECRET=your_secret');
      console.log('   LIVEKIT_HOST=wss://your-project.livekit.cloud');
      console.log('========================\n');
    }
    
    // Initialize services
    this.roomService = new RoomServiceClient(
      this.livekitHost,
      this.apiKey,
      this.apiSecret
    );
  }

  /**
   * Generate token for participant
   */
  generateToken(roomName, participantId, participantName = '', metadata = {}) {
    try {
      console.log(`🔐 Generating token for ${participantId} in room: ${roomName}`);
      
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: participantId.toString(),
        name: participantName || participantId.toString(),
        metadata: JSON.stringify({
          ...metadata,
          userId: participantId,
          name: participantName,
          timestamp: Date.now()
        })
      });
      
      // Grant permissions
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canPublishSources: ['microphone', 'camera', 'screen_share'],
        canUpdateMetadata: true,
        hidden: false,
        recorder: false
      });
      
      const token = at.toJwt();
      console.log(`✅ Token generated successfully`);
      return token;
      
    } catch (error) {
      console.error('❌ Error generating token:', error);
      throw new Error(`Failed to generate token: ${error.message}`);
    }
  }

  /**
   * Create a room
   */
  async createRoom(roomName, options = {}) {
    try {
      const room = await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 10,
        maxParticipants: 2,
        ...options
      });
      console.log(`✅ Room created: ${roomName}`);
      return room;
    } catch (error) {
      console.log(`⚠️  Room might already exist (normal for 1:1 calls)`);
      return null;
    }
  }

  /**
   * List participants
   */
  async listParticipants(roomName) {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      return participants;
    } catch (error) {
      console.error('❌ Error listing participants:', error);
      return [];
    }
  }

  /**
   * End room
   */
  async endRoom(roomName) {
    try {
      await this.roomService.deleteRoom(roomName);
      console.log(`✅ Room ended: ${roomName}`);
      return true;
    } catch (error) {
      console.error('❌ Error ending room:', error);
      return false;
    }
  }

  /**
   * Generate unique room name for 1:1
   */
  generateRoomName(userId1, userId2, callType = 'video') {
    const sortedIds = [userId1.toString(), userId2.toString()].sort();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    
    return `${callType}_${sortedIds[0]}_${sortedIds[1]}_${timestamp}_${random}`;
  }

  /**
   * Check if room exists
   */
  async roomExists(roomName) {
    try {
      const rooms = await this.roomService.listRooms();
      return rooms.some(room => room.name === roomName);
    } catch (error) {
      console.error('❌ Error checking room:', error);
      return false;
    }
  }
}

// Export singleton
const livekitService = new LiveKitService();
export default livekitService;