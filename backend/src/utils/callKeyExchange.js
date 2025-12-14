// Helpers for relaying encrypted key blobs. The server must NOT inspect keys.

export const createKeyEnvelope = ({ callId, senderId, recipientId, encryptedKeyBlob }) => {
  if (!callId || !senderId || !recipientId || !encryptedKeyBlob) {
    throw new Error("Missing fields for key exchange envelope");
  }

  return {
    callId,
    senderId: senderId.toString(),
    recipientId: recipientId.toString(),
    encryptedKeyBlob
  };
};

export const validateKeyEnvelope = (envelope) => {
  if (
    !envelope ||
    typeof envelope.callId !== "string" ||
    typeof envelope.senderId !== "string" ||
    typeof envelope.recipientId !== "string" ||
    typeof envelope.encryptedKeyBlob !== "string"
  ) {
    return false;
  }
  return true;
};

