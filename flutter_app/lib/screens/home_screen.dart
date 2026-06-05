import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import 'chat_list_screen.dart';
import 'friends_screen.dart';

/// Root scaffold that shows bottom nav + listens to global socket events.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  int _friendsBadge = 0;

  @override
  void initState() {
    super.initState();
    _loadBadge();
    _listenSocket();
  }

  Future<void> _loadBadge() async {
    try {
      final n = await ApiService.instance.getPendingCount();
      if (mounted) setState(() => _friendsBadge = n);
    } catch (_) {}
  }

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('friend-request-received',       _onFriendReqReceived);
    s.on('friend-request-accepted-realtime', _onFriendReqAccepted);
    s.on('friend-request-rejected',        _onFriendReqRejected);
    s.on('pending-requests-count-updated', _onPendingCount);
    s.on('user-status-changed', _onStatusChange);
  }

  void _onFriendReqReceived(_) => setState(() => _friendsBadge++);
  void _onFriendReqAccepted(_) => setState(() => _friendsBadge = (_friendsBadge - 1).clamp(0, 999));
  void _onFriendReqRejected(_) => setState(() => _friendsBadge = (_friendsBadge - 1).clamp(0, 999));
  void _onPendingCount(dynamic d) {
    final count = (d as Map?)?['count'] as int? ?? 0;
    if (mounted) setState(() => _friendsBadge = count);
  }
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final screens = [const ChatListScreen(), const FriendsScreen()];

    return Scaffold(
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        indicatorColor: ReonColors.primary.withValues(alpha: 0.12),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.chat_bubble_outline_rounded), selectedIcon: Icon(Icons.chat_bubble_rounded), label: 'Chats'),
          NavigationDestination(
            icon: Badge(isLabelVisible: _friendsBadge > 0, label: Text('$_friendsBadge'),
              child: const Icon(Icons.group_outlined)),
            selectedIcon: Badge(isLabelVisible: _friendsBadge > 0, label: Text('$_friendsBadge'),
              child: const Icon(Icons.group_rounded)),
            label: 'Friends'),
        ],
      ),
    );
  }
}
