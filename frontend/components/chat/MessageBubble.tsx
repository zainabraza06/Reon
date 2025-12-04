"use client";

import React, { useEffect, useState, useCallback } from "react";
import {  Message, GroupMessage } from "@/types";
import { 
  ensureRSAKeys, 
  decryptTextMessage, 
  decryptAESKey, 
  decryptWithAES 
} from "@/lib/crypto";
import { formatTime } from "@/lib/utils";
import { Check, CheckCheck, Lock, Image, Video, Music, File } from "lucide-react";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: Message | GroupMessage;
  isMe: boolean;
  currentUserId: string;
  onDecrypt: (id: string, text: string) => void;
  decryptedText?: string;
}

// Type guards
function isOneToOneMedia(
  media: { url: string; type: string; encryptedKey?: string } | { url: string; type: string; encryptedKeys?: Record<string, string> }
): media is { url: string; type: string; encryptedKey: string } {
  return "encryptedKey" in media && !!media.encryptedKey;
}

function isGroupMedia(
  media: { url: string; type: string; encryptedKey?: string } | { url: string; type: string; encryptedKeys?: Record<string, string> }
): media is { url: string; type: string; encryptedKeys: Record<string, string> } {
  return "encryptedKeys" in media && !!media.encryptedKeys;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  currentUserId,
  onDecrypt,
  decryptedText
}) => {
  const [decrypting, setDecrypting] = useState(false);
  const [showEncrypted, setShowEncrypted] = useState(false);

  const decryptMessage = useCallback(async () => {
    if (!message.ciphertext || decrypting) return;
    setDecrypting(true);

    try {
      let decrypted: string = "";

      // ----- TEXT MESSAGES -----
      if (message.type === "text") {
        if ("encryptedKeys" in message && message.encryptedKeys) {
          // Group text
          const userKeyHex = message.encryptedKeys[currentUserId];
          if (!userKeyHex) throw new Error("No AES key for this user");
          const aesKey = await decryptAESKey(currentUserId, userKeyHex);
          decrypted = await decryptWithAES(aesKey, message.ciphertext);
        } else {
          // One-to-one text
          const { privateKey } = await ensureRSAKeys(currentUserId);
          decrypted = await decryptTextMessage(message.ciphertext, privateKey);
        }
      }

      // ----- MEDIA MESSAGES -----
      else if (message.media?.length) {
        const media = message.media[0]; // assume 1 media per message
        if (isGroupMedia(media)) {
          const userKeyHex = media.encryptedKeys[currentUserId];
          if (!userKeyHex) throw new Error("No AES key for this user");
          const aesKey = await decryptAESKey(currentUserId, userKeyHex);
          decrypted = await decryptWithAES(aesKey, message.ciphertext!);
        } else if (isOneToOneMedia(media)) {
          const aesKey = await decryptAESKey(currentUserId, media.encryptedKey);
          decrypted = await decryptWithAES(aesKey, message.ciphertext!);
        } else {
          throw new Error("No key available for this media");
        }
      }

      onDecrypt(message._id, decrypted);
    } catch (err) {
      console.error("Failed to decrypt message:", err);
      setShowEncrypted(true);
    } finally {
      setDecrypting(false);
    }
  }, [message, currentUserId, decrypting, onDecrypt]);

  useEffect(() => {
    if (!decryptedText && message.ciphertext && !decrypting) {
      decryptMessage();
    }
  }, [decryptedText, decryptMessage, message, decrypting]);

  const senderName = isMe ? null : message.sender;

  const getMediaIcon = (type: string) => {
    switch (type) {
      case "image": return <Image size={16} />;
      case "video": return <Video size={16} />;
      case "audio": return <Music size={16} />;
      default: return <File size={16} />;
    }
  };

  const containerClass = `${styles.container} ${isMe ? styles.sent : styles.received}`;
  const bubbleClass = `${styles.bubble} ${isMe ? styles.sentBubble : styles.receivedBubble}`;
  const metadataClass = `${styles.metadata} ${isMe ? styles.metadataSent : styles.metadataReceived}`;

  return (
    <div className={containerClass}>
      {senderName && <span className={styles.senderName}>{senderName}</span>}

      <div className={bubbleClass}>
        {/* MEDIA */}
        {message.media && message.media.length > 0 && (
          <div className={styles.mediaContainer}>
            {message.media.map((media, idx) => (
              <div key={idx} className={styles.mediaItem}>
                {media.type === "image" && (
                  <img src={media.url} alt="Shared" className={styles.image} />
                )}
                {media.type === "video" && (
                  <video src={media.url} controls className={styles.video} />
                )}
                {media.type === "audio" && (
                  <audio src={media.url} controls className={styles.audio} />
                )}
                {media.type === "document" && (
                  <a href={media.url} target="_blank" className={styles.document}>
                    <div className={styles.iconContainer}>
                      {getMediaIcon(media.type)}
                    </div>
                    <p className={styles.documentText}>Document</p>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* MESSAGE CONTENT */}
        <div className={styles.content}>
          {decryptedText ? (
            <p className={styles.messageText}>{decryptedText}</p>
          ) : message.ciphertext ? (
            <div className={styles.decryptionContainer}>
              {decrypting ? (
                <div className={styles.decrypting}>
                  <div className={styles.dots}>
                    <div className={`${styles.dot} ${styles.dot1}`}></div>
                    <div className={`${styles.dot} ${styles.dot2}`}></div>
                    <div className={`${styles.dot} ${styles.dot3}`}></div>
                  </div>
                  <span className={styles.decryptingText}>Decrypting…</span>
                </div>
              ) : showEncrypted ? (
                <div className={styles.encrypted}>
                  <Lock size={14} />
                  <button className={styles.retryButton} onClick={decryptMessage}>
                    Try again
                  </button>
                </div>
              ) : (
                <div className={styles.encrypted}>
                  <Lock size={14} />
                  <span className={styles.encryptedText}>Encrypted message</span>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.messageText}>{message.text || "Empty message"}</p>
          )}
        </div>

        {/* TIMESTAMP + STATUS */}
        <div className={metadataClass}>
          <span className={styles.timestamp}>{formatTime(message.sentAt)}</span>
          {isMe && (
            <span className={styles.status}>
              {message.read ? (
                <CheckCheck size={14} className={styles.readIcon} />
              ) : message.delivered ? (
                <Check size={14} />
              ) : (
                <Check size={14} className={styles.checkIcon} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(MessageBubble);