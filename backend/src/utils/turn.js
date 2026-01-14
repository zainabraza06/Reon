
export  const  buildIceServers = () => {
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_PASSWORD;
  console.log("turn credentials",username,credential);
  
  if (!username || !credential) {
    console.warn('⚠️ TURN credentials missing. Using public STUN only.');
    return [
      // Start with STUN servers (for NAT traversal help)
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];
  }
  
  // OPTIMAL ORDER FOR WEBRTC:
  return [
    // 1. STUN SERVERS FIRST (helps with NAT traversal)
    //    WebRTC tries direct P2P first, then uses STUN if needed
    {
      urls: "stun:stun.relay.metered.ca:80"
    },
    {
      urls: "stun:stun.l.google.com:19302"
    },
    
    // 2. TURN SERVERS (relays - used when STUN fails)
    //    Ordered by speed and compatibility
    {
      urls: "turn:global.relay.metered.ca:80",
      username: username,
      credential: credential
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: username,
      credential: credential
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: username,
      credential: credential
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: username,
      credential: credential
    }
  ];
};


export const testIceServers = () => {
  const servers = buildIceServers();
  
  const serverTypes = servers.map((server, index) => {
    const url = Array.isArray(server.urls) ? server.urls[0] : server.urls;
    let type = 'UNKNOWN';
    let priority = index + 1;
    
    if (url.includes('stun:')) {
      type = 'STUN (NAT traversal helper)';
    } else if (url.includes('turn:') && url.includes('transport=tcp')) {
      type = 'TURN-TCP (firewall-friendly relay)';
    } else if (url.includes('turns:')) {
      type = 'TURN-TLS (secure relay)';
    } else if (url.includes('turn:')) {
      type = 'TURN-UDP (fastest relay)';
    }
    
    return {
      priority: priority,
      type: type,
      url: url,
      hasCredentials: !!(server.username && server.credential)
    };
  });
  
  return {
    success: true,
    connectionPriority: "WebRTC will try: 1. Direct P2P → 2. STUN-assisted → 3. TURN relay",
    totalServers: servers.length,
    stunCount: servers.filter(s => 
      (Array.isArray(s.urls) ? s.urls[0] : s.urls).includes('stun:')
    ).length,
    turnCount: servers.filter(s => 
      (Array.isArray(s.urls) ? s.urls[0] : s.urls).includes('turn:') ||
      (Array.isArray(s.urls) ? s.urls[0] : s.urls).includes('turns:')
    ).length,
    servers: serverTypes,
    credentialsConfigured: !!(process.env.TURN_USERNAME && process.env.TURN_PASSWORD)
  };
};