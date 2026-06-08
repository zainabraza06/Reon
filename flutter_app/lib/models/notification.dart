class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? avatar;
  final String? link;
  final bool read;
  final DateTime timestamp;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.avatar,
    this.link,
    required this.read,
    required this.timestamp,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['_id'] ?? j['id']) as String,
        type: j['type'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        avatar: j['avatar'] as String?,
        link: j['link'] as String?,
        read: j['read'] as bool? ?? false,
        timestamp: DateTime.parse((j['createdAt'] ?? j['timestamp']) as String),
      );
}
