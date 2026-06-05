class MockUser {
  final String id;
  final String name;
  final String username;
  final String? avatar;
  final bool isOnline;

  const MockUser({required this.id, required this.name, required this.username, this.avatar, this.isOnline = false});
}

class MockMessage {
  final String id;
  final String senderId;
  final String text;
  final DateTime sentAt;
  final bool isDelivered;
  final DateTime? deliveredAt;
  final bool isRead;
  final DateTime? readAt;

  const MockMessage({
    required this.id,
    required this.senderId,
    required this.text,
    required this.sentAt,
    this.isDelivered = true,
    this.deliveredAt,
    this.isRead = true,
    this.readAt,
  });

  /// "sent" | "delivered" | "read"
  String get status {
    if (isRead)      return 'read';
    if (isDelivered) return 'delivered';
    return 'sent';
  }
}

class MockChat {
  final MockUser user;
  final String? lastMessage;
  final DateTime? lastTime;
  final int unread;

  const MockChat({required this.user, this.lastMessage, this.lastTime, this.unread = 0});
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const kMe = MockUser(id: 'me', name: 'Jane Doe', username: 'janedoe', isOnline: true);

final kChats = <MockChat>[
  MockChat(user: const MockUser(id: '1', name: 'Alex Rivera', username: 'alexr', isOnline: true),  lastMessage: 'Sounds good! See you at 6.', lastTime: DateTime.now().subtract(const Duration(minutes: 3)),  unread: 2),
  MockChat(user: const MockUser(id: '2', name: 'Mia Chen',   username: 'miachen', isOnline: false), lastMessage: 'Did you see the news today?', lastTime: DateTime.now().subtract(const Duration(minutes: 47)), unread: 0),
  MockChat(user: const MockUser(id: '3', name: 'Sam Taylor', username: 'samt',   isOnline: true),  lastMessage: '🎉 Happy to help!',            lastTime: DateTime.now().subtract(const Duration(hours: 2)),   unread: 1),
  MockChat(user: const MockUser(id: '4', name: 'Priya Singh', username: 'priya', isOnline: false), lastMessage: 'Can you send the files?',      lastTime: DateTime.now().subtract(const Duration(hours: 5)),   unread: 0),
  MockChat(user: const MockUser(id: '5', name: 'Omar Hassan', username: 'omar',  isOnline: false), lastMessage: 'Thanks, that worked!',          lastTime: DateTime.now().subtract(const Duration(days: 1)),    unread: 0),
  MockChat(user: const MockUser(id: '6', name: 'Luna Park',   username: 'luna',  isOnline: true),  lastMessage: 'I'll be there in 10 mins',      lastTime: DateTime.now().subtract(const Duration(days: 2)),    unread: 3),
];

List<MockMessage> conversationWith(String userId) {
  final now = DateTime.now();
  return [
    MockMessage(id: '1', senderId: userId, text: 'Hey! How are you doing?',
        sentAt: now.subtract(const Duration(hours: 1, minutes: 30))),
    MockMessage(id: '2', senderId: 'me',   text: "I'm great, thanks for asking!",
        sentAt: now.subtract(const Duration(hours: 1, minutes: 28)),
        isDelivered: true, deliveredAt: now.subtract(const Duration(hours: 1, minutes: 27)),
        isRead: true,      readAt:      now.subtract(const Duration(hours: 1, minutes: 26))),
    MockMessage(id: '3', senderId: userId, text: 'Are you free this evening?',
        sentAt: now.subtract(const Duration(hours: 1, minutes: 15))),
    MockMessage(id: '4', senderId: 'me',   text: 'Yes, I should be free around 7pm. What did you have in mind?',
        sentAt: now.subtract(const Duration(hours: 1, minutes: 10)),
        isDelivered: true, deliveredAt: now.subtract(const Duration(hours: 1, minutes: 9)),
        isRead: true,      readAt:      now.subtract(const Duration(hours: 1, minutes: 8))),
    MockMessage(id: '5', senderId: userId, text: 'Thought we could grab dinner at that new place downtown 🍜',
        sentAt: now.subtract(const Duration(minutes: 58))),
    MockMessage(id: '6', senderId: 'me',   text: "That sounds amazing! I've been wanting to try it.",
        sentAt: now.subtract(const Duration(minutes: 55)),
        isDelivered: true, deliveredAt: now.subtract(const Duration(minutes: 54)),
        isRead: true,      readAt:      now.subtract(const Duration(minutes: 52))),
    MockMessage(id: '7', senderId: userId, text: "Perfect! I'll make a reservation for 7:30.",
        sentAt: now.subtract(const Duration(minutes: 10))),
    MockMessage(id: '8', senderId: 'me',   text: 'Sounds good! See you at 6.',
        sentAt: now.subtract(const Duration(minutes: 3)),
        isDelivered: true, deliveredAt: now.subtract(const Duration(minutes: 2)),
        isRead: false),
  ];
}
