import crypto from "crypto";

const DEFAULT_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

// Build ICE servers list. If turnOnly=true, drop STUN to force TURN path.
export const buildIceServers = async (turnOnly = false) => {
  const ice = [];

  if (!turnOnly) {
    ice.push(...DEFAULT_STUN);
  }

  const turnUrl = process.env.TURN_URL || "turn:turn.reonapp.com:3478";
  const staticUser = process.env.TURN_USERNAME;
  const staticPass = process.env.TURN_PASSWORD;
  const sharedSecret = process.env.TURN_SHARED_SECRET;

  if (sharedSecret) {
    // Ephemeral TURN credentials (coturn REST auth style)
    const ttlSeconds = 3600;
    const username = Math.floor(Date.now() / 1000) + ttlSeconds;
    const hmac = crypto.createHmac("sha1", sharedSecret);
    hmac.update(username.toString());
    const credential = hmac.digest("base64");
    ice.push({
      urls: turnUrl,
      username: username.toString(),
      credential
    });
  } else if (staticUser && staticPass) {
    ice.push({
      urls: turnUrl,
      username: staticUser,
      credential: staticPass
    });
  }

  return ice;
};

