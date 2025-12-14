/* E2EE TEMPORARILY DISABLED - Pass-through mode for audio reliability fixes.
   Transform streams are stubbed to pass media frames unchanged. */

export const supportsInsertableStreams = () => false; // Always return false to disable E2EE

export const importMediaKey = async (rawKey: ArrayBuffer) => {
  // Stub - return a dummy key (not used when E2EE is disabled)
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const attachSenderTransform = async (
  sender: RTCRtpSender,
  key: CryptoKey
) => {
  // E2EE DISABLED - No-op pass-through
  // Do NOT attach transform streams - media passes through unchanged
  console.log('🔓 E2EE disabled - sender transform not attached (pass-through mode)');
};

export const attachReceiverTransform = async (
  receiver: RTCRtpReceiver,
  key: CryptoKey
) => {
  // E2EE DISABLED - No-op pass-through
  // Do NOT attach transform streams - media passes through unchanged
  console.log('🔓 E2EE disabled - receiver transform not attached (pass-through mode)');
};

