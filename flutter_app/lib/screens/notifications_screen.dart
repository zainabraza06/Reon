import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/notification.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/socket_service.dart';
import '../widgets/chat_avatar.dart';
import 'chat_screen.dart';
import 'group_chat_screen.dart';

class NotificationsScreen extends StatefulWidget {
  final ValueChanged<int>? onUnreadChanged;
  final VoidCallback? onGoToFriends;
  const NotificationsScreen({super.key, this.onUnreadChanged, this.onGoToFriends});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _items = [];
  bool _loading = true;

  int get _unread => _items.where((n) => !n.read).length;

  @override
  void initState() {
    super.initState();
    _load();
    _listenSocket();
  }

  @override
  void dispose() {
    final s = SocketService.instance;
    s.off('friend-request-received', _onFriendReq);
    s.off('friend-request-accepted-realtime', _onFriendAccepted);
    s.off('group-added', _onGroupAdded);
    s.off('new-message', _onNewMessage);
    s.off('new-group-message', _onNewGroupMessage);
    super.dispose();
  }

  void _notifyUnread() => widget.onUnreadChanged?.call(_unread);

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await ApiService.instance.getNotifications();
      if (mounted) {
        setState(() {
          _items = list;
          _loading = false;
        });
        _notifyUnread();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('friend-request-received', _onFriendReq);
    s.on('friend-request-accepted-realtime', _onFriendAccepted);
    s.on('group-added', _onGroupAdded);
    s.on('new-message', _onNewMessage);
    s.on('new-group-message', _onNewGroupMessage);
  }

  void _prepend(AppNotification n) {
    if (!mounted) return;
    setState(() => _items = [n, ..._items].take(50).toList());
    _notifyUnread();
  }

  Future<void> _prependAndSave(AppNotification n) async {
    _prepend(n);
    try {
      final saved = await ApiService.instance.createNotification(
        type: n.type,
        title: n.title,
        body: n.body,
        avatar: n.avatar,
        link: n.link,
      );
      if (mounted) {
        setState(() {
          _items = _items.map((item) => item.id == n.id ? saved : item).toList();
        });
      }
    } catch (_) {}
  }

  void _onFriendReq(dynamic d) {
    final m = d as Map?;
    final sender = m?['sender'] as Map?;
    if (sender == null) return;
    _prependAndSave(AppNotification(
      id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
      type: 'friend_request',
      title: 'Friend Request',
      body: '${sender['fullName']} sent you a friend request',
      avatar: sender['profilePic'] as String?,
      link: jsonEncode({'type': 'friends'}),
      read: false,
      timestamp: DateTime.now(),
    ));
  }

  void _onFriendAccepted(dynamic d) {
    final m = d as Map?;
    final receiver = m?['receiver'] as Map?;
    _prependAndSave(AppNotification(
      id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      body: '${receiver?['fullName'] ?? 'Someone'} accepted your friend request',
      avatar: receiver?['profilePic'] as String?,
      link: jsonEncode({'type': 'friends'}),
      read: false,
      timestamp: DateTime.now(),
    ));
  }

  void _onGroupAdded(dynamic d) {
    final m = d as Map?;
    final group = m?['group'] as Map?;
    if (group == null) return;

    final me = NotificationService.currentUserId;

    // Skip if the current user is the admin who performed the add
    final addedBy = m?['addedBy'] as String?;
    if (addedBy != null && addedBy == me) return;

    // If the backend sends userId (who was added), only notify that specific user
    final addedUserId = m?['userId'] as String?;
    if (addedUserId != null && addedUserId != me) return;

    _prependAndSave(AppNotification(
      id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
      type: 'group_added',
      title: 'Added to Group',
      body: 'You were added to ${group['name']}',
      avatar: group['avatar'] as String?,
      read: false,
      timestamp: DateTime.now(),
    ));
  }

  void _onNewMessage(dynamic d) {
    final m = d as Map?;
    final senderId = m?['sender'] as String?;

    // Don't notify the sender about their own message
    if (senderId != null && senderId == NotificationService.currentUserId) return;

    final senderInfo = m?['senderInfo'] as Map?;
    final senderName = senderInfo?['fullName'] as String? ?? 'Someone';
    final senderAvatar = senderInfo?['profilePic'] as String?;
    _prependAndSave(AppNotification(
      id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
      type: 'new_message',
      title: senderName,
      body: 'Sent you a message',
      avatar: senderAvatar,
      link: senderId != null
          ? jsonEncode({'type': 'chat', 'userId': senderId, 'userName': senderName})
          : null,
      read: false,
      timestamp: DateTime.now(),
    ));
  }

  void _onNewGroupMessage(dynamic d) {
    final m = d as Map?;
    final gid = m?['groupId'] as String?;
    final groupName = m?['groupName'] as String? ?? 'a group';

    final message = m?['message'] as Map?;

    // Skip system messages (member add/remove events are shown inline in the chat)
    final contentType = message?['contentType'] as String?;
    if (contentType == 'system') return;

    // Don't notify the sender about their own message
    final sender = message?['sender'] as Map?;
    final senderId = (sender?['_id'] ?? sender?['id']) as String?;
    if (senderId != null && senderId == NotificationService.currentUserId) return;

    _prependAndSave(AppNotification(
      id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
      type: 'new_group_message',
      title: groupName,
      body: 'New message in $groupName',
      link: gid != null
          ? jsonEncode({'type': 'group', 'groupId': gid, 'groupName': groupName})
          : null,
      read: false,
      timestamp: DateTime.now(),
    ));
  }

  void _navigate(AppNotification n) {
    final link = n.link;
    if (link == null) return;
    try {
      final data = jsonDecode(link) as Map<String, dynamic>;
      final type = data['type'] as String?;
      if (type == 'friends') {
        widget.onGoToFriends?.call();
      } else if (type == 'chat') {
        final userId = data['userId'] as String? ?? '';
        final userName = data['userName'] as String? ?? 'User';
        navigatorKey.currentState?.push(MaterialPageRoute(
          builder: (_) => ChatScreen(userId: userId, userName: userName),
        ));
      } else if (type == 'group') {
        final groupId = data['groupId'] as String? ?? '';
        final groupName = data['groupName'] as String? ?? 'Group';
        navigatorKey.currentState?.push(MaterialPageRoute(
          builder: (_) => GroupChatScreen(groupId: groupId, groupName: groupName),
        ));
      }
    } catch (_) {}
  }

  Future<void> _markRead(String id) async {
    setState(() => _items = _items
        .map((n) => n.id == id
            ? AppNotification(
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                avatar: n.avatar,
                link: n.link,
                read: true,
                timestamp: n.timestamp,
              )
            : n)
        .toList());
    _notifyUnread();
    await ApiService.instance.markNotificationRead(id).catchError((_) {});
  }

  Future<void> _markAllRead() async {
    setState(() => _items = _items
        .map((n) => AppNotification(
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              avatar: n.avatar,
              link: n.link,
              read: true,
              timestamp: n.timestamp,
            ))
        .toList());
    _notifyUnread();
    await ApiService.instance.markAllNotificationsRead().catchError((_) {});
  }

  Future<void> _remove(String id) async {
    setState(() => _items.removeWhere((n) => n.id == id));
    _notifyUnread();
    await ApiService.instance.deleteNotification(id).catchError((_) {});
  }

  Future<void> _clearAll() async {
    setState(() => _items = []);
    _notifyUnread();
    await ApiService.instance.clearNotifications().catchError((_) {});
  }

  String _formatTime(DateTime ts) {
    final diff = DateTime.now().difference(ts);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return DateFormat.MMMd().format(ts);
  }

  IconData _iconFor(String type) => switch (type) {
        'friend_request' => Icons.person_add_rounded,
        'friend_accepted' => Icons.check_circle_outline_rounded,
        'group_added' => Icons.group_add_rounded,
        'group_removed' => Icons.group_remove_rounded,
        'new_message' => Icons.chat_bubble_outline_rounded,
        _ => Icons.forum_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(children: [
      Container(
        padding: EdgeInsets.only(
            top: MediaQuery.of(context).padding.top + 8,
            left: 16,
            right: 16,
            bottom: 12),
        decoration: BoxDecoration(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          border: Border(
              bottom: BorderSide(
                  color:
                      isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        ),
        child: Row(children: [
          const Icon(Icons.notifications_outlined,
              color: ReonColors.primary, size: 20),
          const SizedBox(width: 8),
          Text('Notifications',
              style:
                  GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16)),
          if (_unread > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                  gradient: kBrandGradient,
                  borderRadius: BorderRadius.circular(10)),
              child: Text('$_unread',
                  style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700)),
            ),
          ],
          const Spacer(),
          if (_unread > 0)
            TextButton(
                onPressed: _markAllRead,
                child: Text('Mark all read',
                    style: GoogleFonts.inter(
                        fontSize: 12, color: ReonColors.primary))),
          if (_items.isNotEmpty)
            TextButton(
                onPressed: _clearAll,
                child: Text('Clear',
                    style: GoogleFonts.inter(
                        fontSize: 12, color: ReonColors.textMuted))),
        ]),
      ),
      Expanded(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: ReonColors.primary))
            : _items.isEmpty
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.notifications_none_rounded,
                        size: 48,
                        color: ReonColors.textMuted.withValues(alpha: 0.4)),
                    const SizedBox(height: 12),
                    Text('All caught up!',
                        style: GoogleFonts.inter(
                            fontWeight: FontWeight.w600,
                            color: ReonColors.textMuted)),
                    Text('No notifications yet',
                        style: GoogleFonts.inter(
                            fontSize: 12, color: ReonColors.textMuted)),
                  ]))
                : ListView.builder(
                    itemCount: _items.length,
                    itemBuilder: (ctx, i) {
                      final n = _items[i];
                      return Dismissible(
                        key: ValueKey(n.id),
                        direction: DismissDirection.endToStart,
                        onDismissed: (_) => _remove(n.id),
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          color: ReonColors.danger.withValues(alpha: 0.15),
                          child: const Icon(Icons.delete_outline,
                              color: ReonColors.danger),
                        ),
                        child: InkWell(
                          onTap: () {
                            if (!n.read) _markRead(n.id);
                            _navigate(n);
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 12),
                            color: !n.read
                                ? ReonColors.primary.withValues(alpha: 0.05)
                                : null,
                            child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  n.avatar != null
                                      ? ChatAvatar(
                                          name: n.title,
                                          imageUrl: n.avatar,
                                          size: 42)
                                      : CircleAvatar(
                                          radius: 21,
                                          backgroundColor: ReonColors.primary
                                              .withValues(alpha: 0.12),
                                          child: Icon(_iconFor(n.type),
                                              size: 18,
                                              color: ReonColors.primary),
                                        ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                        Text(n.title,
                                            style: GoogleFonts.inter(
                                                fontWeight: FontWeight.w600,
                                                fontSize: 14)),
                                        Text(n.body,
                                            style: GoogleFonts.inter(
                                                fontSize: 13,
                                                color: ReonColors.textMuted)),
                                        Text(_formatTime(n.timestamp),
                                            style: GoogleFonts.inter(
                                                fontSize: 11,
                                                color: ReonColors.textMuted)),
                                      ])),
                                  if (!n.read)
                                    Container(
                                        width: 8,
                                        height: 8,
                                        decoration: const BoxDecoration(
                                            color: ReonColors.primary,
                                            shape: BoxShape.circle)),
                                ]),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    ]);
  }
}
