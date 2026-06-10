class ChatListItem {
  final String id;
  final String fullName;
  final String? username;
  final String? profilePic;
  final String? lastMessageContent;
  final String? lastMessageType;
  final DateTime? lastMessageAt;
  final int unreadCount;
  bool isOnline;

  ChatListItem({
    required this.id,
    required this.fullName,
    this.username,
    this.profilePic,
    this.lastMessageContent,
    this.lastMessageType,
    this.lastMessageAt,
    this.unreadCount = 0,
    this.isOnline = false,
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
      lastMessageAt: lm?['sentAt'] != null
          ? DateTime.tryParse(lm!['sentAt'] as String)
          : null,
      unreadCount: j['unreadCount'] as int? ?? 0,
      isOnline: j['isOnline'] as bool? ?? false,
    );
  }

  String get previewText {
    if (lastMessageAt == null) return 'No messages yet';
    switch (lastMessageType) {
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'audio':
        return '🎤 Voice message';
      case 'document':
        return '📄 Document';
      case null:
      case 'text':
        return '💬 New message';
      default:
        return '📎 ${lastMessageType!}';
    }
  }
}
