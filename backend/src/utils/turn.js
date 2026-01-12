// TURN/STUN server configuration
export const buildIceServers = async (turnOnly = false) => {
  const servers = [];
  
  // STUN servers (always public)
  if (!turnOnly) {
    servers.push({
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ]
    });
  }
  
  // TURN servers (configure with your credentials)
  if (process.env.TURN_SERVER && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({
      urls: process.env.TURN_SERVER,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  
  return servers;
};

// Test endpoint for debugging
export const testIceServers = async () => {
  const iceServers = await buildIceServers();
  const hasTurn = iceServers.some(server => 
    server.urls.some(url => url.includes('turn:'))
  );
  
  return {
    iceServers,
    hasTurnServers: hasTurn,
    serverCount: iceServers.length,
    environment: process.env.NODE_ENV
  };
};