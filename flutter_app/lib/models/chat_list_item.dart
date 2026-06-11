class ChatListItem {
  final String id;
  final String fullName;
  final String? username;
  final String? profilePic;
  final String? lastMessageContent;
  final String? lastMessageType;
  final String? lastSenderId;
  final DateTime? lastMessageAt;
  final int unreadCount;
  bool isOnline;
  // Used for deferred decryption of the last message preview
  final String? lastMessageCiphertext;
  final String? lastMessageEncryptedKey;

  ChatListItem({
    required this.id,
    required this.fullName,
    this.username,
    this.profilePic,
    this.lastMessageContent,
    this.lastMessageType,
    this.lastSenderId,
    this.lastMessageAt,
    this.unreadCount = 0,
    this.isOnline = false,
    this.lastMessageCiphertext,
    this.lastMessageEncryptedKey,
  });

  factory ChatListItem.fromJson(Map<String, dynamic> j) {
    final lm = j['lastMessage'] as Map<String, dynamic>?;
    return ChatListItem(
      id: j['_id'] as String,
      fullName: j['fullName'] as String,
      username: j['username'] as String?,
      profilePic: j['profilePic'] as String?,
      lastMessageContent: lm?['content'] as String?,
      lastMessageType: lm?['contentType'] as String?,
      lastSenderId: lm?['sender'] as String?,
      lastMessageAt: lm?['sentAt'] != null
          ? DateTime.tryParse(lm!['sentAt'] as String)
          : null,
      unreadCount: j['unreadCount'] as int? ?? 0,
      isOnline: j['isOnline'] as bool? ?? false,
      lastMessageCiphertext: lm?['ciphertext'] as String?,
      lastMessageEncryptedKey: lm?['encryptedKey'] as String?,
    );
  }

  String previewTextFor(String myId) {
    if (lastMessageAt == null) return 'No messages yet';
    final isMe = lastSenderId == myId;
    final prefix = isMe ? 'You: ' : '';
    switch (lastMessageType) {
      case 'image':    return '${prefix}📷 Photo';
      case 'video':    return '${prefix}🎥 Video';
      case 'audio':    return '${prefix}🎤 Voice message';
      case 'document': return '${prefix}📄 Document';
    }
    // For text messages show actual decrypted content when available
    if (lastMessageContent != null && lastMessageContent!.isNotEmpty) {
      return '$prefix$lastMessageContent';
    }
    return '${prefix}New message';
  }
}
