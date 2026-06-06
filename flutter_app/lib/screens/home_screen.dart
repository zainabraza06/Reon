import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../models/notification.dart';
import 'chat_list_screen.dart';
import 'friends_screen.dart';
import 'recommendations_screen.dart';
import 'notifications_screen.dart';
import 'settings_screen.dart';

/// Root scaffold that shows bottom nav + listens to global socket events.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  int _friendsBadge = 0;
  int _notifBadge = 0;

  @override
  void initState() {
    super.initState();
    _loadBadges();
    _listenSocket();
  }

  Future<void> _loadBadges() async {
    try {
      final results = await Future.wait([
        ApiService.instance.getPendingCount(),
        ApiService.instance.getNotifications(),
      ]);
      final notifs = results[1] as List<AppNotification>;
      if (mounted) setState(() {
        _friendsBadge = results[0] as int;
        _notifBadge = notifs.where((n) => !n.read).length;
      });
    } catch (_) {}
  }

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('friend-request-received',       _onFriendReqReceived);
    s.on('friend-request-accepted-realtime', _onFriendReqAccepted);
    s.on('friend-request-rejected',        _onFriendReqRejected);
    s.on('pending-requests-count-updated', _onPendingCount);
    s.on('user-status-changed', _onStatusChange);
    s.on('new-message', _onNotifBump);
    s.on('new-group-message', _onNotifBump);
  }

  void _onFriendReqReceived(_) => setState(() { _friendsBadge++; _notifBadge++; });
  void _onFriendReqAccepted(_) => setState(() => _friendsBadge = (_friendsBadge - 1).clamp(0, 999));
  void _onFriendReqRejected(_) => setState(() => _friendsBadge = (_friendsBadge - 1).clamp(0, 999));
  void _onPendingCount(dynamic d) {
    final count = (d as Map?)?['count'] as int? ?? 0;
    if (mounted) setState(() => _friendsBadge = count);
  }
  void _onNotifBump(_) => setState(() => _notifBadge++);
  void _onStatusChange(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    context.read<AuthProvider>().updateOnlineStatus(
      m['userId'] as String? ?? '', m['isOnline'] as bool? ?? false);
  }

  @override
  void dispose() {
    final s = SocketService.instance;
    s.off('friend-request-received',       _onFriendReqReceived);
    s.off('friend-request-accepted-realtime', _onFriendReqAccepted);
    s.off('friend-request-rejected',        _onFriendReqRejected);
    s.off('pending-requests-count-updated', _onPendingCount);
    s.off('user-status-changed', _onStatusChange);
    s.off('new-message', _onNotifBump);
    s.off('new-group-message', _onNotifBump);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final screens = [
      const ChatListScreen(),
      const FriendsScreen(),
      const RecommendationsScreen(),
      NotificationsScreen(onUnreadChanged: (n) => setState(() => _notifBadge = n)),
      const SettingsScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        indicatorColor: ReonColors.primary.withValues(alpha: 0.12),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline_rounded),
            selectedIcon: Icon(Icons.chat_bubble_rounded),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: _friendsBadge > 0,
              label: Text('$_friendsBadge'),
              child: const Icon(Icons.group_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: _friendsBadge > 0,
              label: Text('$_friendsBadge'),
              child: const Icon(Icons.group_rounded),
            ),
            label: 'Friends',
          ),
          const NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            selectedIcon: Icon(Icons.explore_rounded),
            label: 'Discover',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: _notifBadge > 0,
              label: Text('$_notifBadge'),
              child: const Icon(Icons.notifications_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: _notifBadge > 0,
              label: Text('$_notifBadge'),
              child: const Icon(Icons.notifications_rounded),
            ),
            label: 'Alerts',
          ),
          const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
