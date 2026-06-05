import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../models/user.dart';
import '../models/friend_request.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../providers/auth_provider.dart';
import '../widgets/chat_avatar.dart';
import 'chat_screen.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});
  @override State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab;
  List<ReonUser>       _friends  = [];
  List<FriendRequest>  _received = [];
  List<FriendRequest>  _sent     = [];
  final _pending = <String>{};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _load();
    _listenSocket();
  }

  @override
  void dispose() {
    _tab.dispose();
    final s = SocketService.instance;
    s.off('friend-request-received',        _onRefresh);
    s.off('friend-request-sent-realtime',   _onRefresh);
    s.off('friend-request-accepted-realtime', _onRefresh);
    s.off('friend-request-rejected',        _onRefresh);
    s.off('friend-request-withdrawn',       _onRefresh);
    s.off('friend-removed',                 _onFriendRemoved);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.instance.getFriends(),
        ApiService.instance.getReceivedRequests(),
        ApiService.instance.getSentRequests(),
      ]);
      if (mounted) setState(() {
        _friends  = results[0] as List<ReonUser>;
        _received = results[1] as List<FriendRequest>;
        _sent     = results[2] as List<FriendRequest>;
        _loading  = false;
      });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('friend-request-received',        _onRefresh);
    s.on('friend-request-sent-realtime',   _onRefresh);
    s.on('friend-request-accepted-realtime', _onRefresh);
    s.on('friend-request-rejected',        _onRefresh);
    s.on('friend-request-withdrawn',       _onRefresh);
    s.on('friend-removed',                 _onFriendRemoved);
  }

  void _onRefresh(_) => _load();

  void _onFriendRemoved(dynamic d) {
    final m = d as Map?; if (m == null) return;
    final myId = context.read<AuthProvider>().user?.id ?? '';
    final removedId = (m['userId'] as String?) == myId ? m['friendId'] as String? : m['userId'] as String?;
    if (removedId != null && mounted) setState(() => _friends.removeWhere((f) => f.id == removedId));
  }

  Future<void> _accept(String requestId) async {
    setState(() => _pending.add(requestId));
    try {
      await ApiService.instance.acceptFriendRequest(requestId);
      await _load();
    } catch (_) {}
    if (mounted) setState(() => _pending.remove(requestId));
  }

  Future<void> _reject(String requestId) async {
    await ApiService.instance.rejectFriendRequest(requestId).catchError((_) {});
    _load();
  }

  Future<void> _withdraw(String requestId) async {
    await ApiService.instance.withdrawFriendRequest(requestId).catchError((_) {});
    _load();
  }

  Future<void> _remove(String userId) async {
    await ApiService.instance.removeFriend(userId).catchError((_) {});
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final receivedCount = _received.length;

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: Column(children: [
        // Header
        Container(color: isDark ? ReonColors.surfaceDark : Colors.white,
          padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8, left: 20, right: 16, bottom: 12),
          child: Row(children: [
            Text('Friends', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, color: isDark ? Colors.white : ReonColors.textLight)),
            const Spacer(),
            IconButton(icon: const Icon(Icons.refresh_rounded), color: isDark ? ReonColors.textMuted : Colors.grey.shade500, onPressed: _load, tooltip: 'Refresh'),
          ])),
        // Tabs
        Container(color: isDark ? ReonColors.surfaceDark : Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: Container(height: 36,
            decoration: BoxDecoration(color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(10)),
            child: TabBar(controller: _tab,
              labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
              unselectedLabelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500),
              labelColor: Colors.white, unselectedLabelColor: ReonColors.textMuted,
              indicator: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(8)),
              indicatorSize: TabBarIndicatorSize.tab, dividerColor: Colors.transparent,
              tabs: [
                const Tab(text: 'Friends'),
                Tab(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Text('Requests'),
                  if (receivedCount > 0) ...[
                    const SizedBox(width: 6),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(color: ReonColors.danger, borderRadius: BorderRadius.circular(99)),
                      child: Text('$receivedCount', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white))),
                  ],
                ])),
              ]))),
        Expanded(child: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(controller: _tab, children: [
              // Friends tab
              RefreshIndicator(onRefresh: _load, child: _friends.isEmpty
                ? _Empty('No friends yet')
                : ListView.builder(itemCount: _friends.length, itemBuilder: (_, i) {
                    final f = _friends[i];
                    return _FriendTile(
                      user: f,
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(icon: const Icon(Icons.chat_bubble_outline_rounded, size: 20), color: ReonColors.primary,
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(userId: f.id, userName: f.fullName, userAvatar: f.profilePic)))),
                        IconButton(icon: const Icon(Icons.person_remove_outlined, size: 20), color: Colors.grey,
                          onPressed: () => _showRemoveDialog(f)),
                      ]));
                  })),
              // Requests tab
              RefreshIndicator(onRefresh: _load, child: _received.isEmpty && _sent.isEmpty
                ? _Empty('No pending requests')
                : ListView(children: [
                    if (_received.isNotEmpty) ...[
                      _SectionHeader('Received (${_received.length})'),
                      ..._received.map((r) => _FriendTile(user: r.sender,
                        subtitle: 'Wants to connect',
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          _ActionBtn(label: 'Accept', loading: _pending.contains(r.id), gradient: true,
                            onTap: () => _accept(r.id)),
                          const SizedBox(width: 8),
                          _ActionBtn(label: 'Decline', loading: false, gradient: false,
                            onTap: () => _reject(r.id)),
                        ]))),
                    ],
                    if (_sent.isNotEmpty) ...[
                      _SectionHeader('Sent (${_sent.length})'),
                      ..._sent.map((r) => _FriendTile(user: r.receiver,
                        subtitle: 'Pending…',
                        trailing: _ActionBtn(label: 'Withdraw', loading: false, gradient: false,
                          onTap: () => _withdraw(r.id)))),
                    ],
                  ])),
            ])),
      ]),
    );
  }

  void _showRemoveDialog(ReonUser f) {
    showDialog(context: context, builder: (ctx) => AlertDialog(
      title: Text('Remove ${f.fullName}?', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
      content: Text('They won\'t be notified, but you\'ll need to send a new friend request to reconnect.',
        style: GoogleFonts.inter(fontSize: 13)),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
        TextButton(onPressed: () { Navigator.of(ctx).pop(); _remove(f.id); },
          child: Text('Remove', style: TextStyle(color: ReonColors.danger))),
      ],
    ));
  }
}

class _FriendTile extends StatelessWidget {
  final ReonUser user;
  final String? subtitle;
  final Widget? trailing;
  const _FriendTile({required this.user, this.subtitle, this.trailing});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: isDark ? ReonColors.borderDark.withValues(alpha: 0.4) : const Color(0xFFF0F0F0)))),
      child: Row(children: [
        ChatAvatar(name: user.fullName, imageUrl: user.profilePic, size: 46, isOnline: user.isOnline),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(user.fullName, style: GoogleFonts.inter(fontSize: 14.5, fontWeight: FontWeight.w600, color: isDark ? ReonColors.textDark : ReonColors.textLight)),
          Text(subtitle ?? user.displayName, style: GoogleFonts.inter(fontSize: 12.5, color: ReonColors.textMuted)),
        ])),
        if (trailing != null) trailing!,
      ]),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label; final bool loading, gradient; final VoidCallback onTap;
  const _ActionBtn({required this.label, required this.loading, required this.gradient, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(gradient: gradient ? kBrandGradient : null,
        border: gradient ? null : Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
        boxShadow: gradient ? [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.25), blurRadius: 8)] : null),
      child: loading
        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
        : Text(label, style: GoogleFonts.inter(fontSize: 12.5, fontWeight: FontWeight.w600, color: gradient ? Colors.white : ReonColors.textMuted))));
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Text(text.toUpperCase(), style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: ReonColors.textMuted)));
}

class _Empty extends StatelessWidget {
  final String msg;
  const _Empty(this.msg);
  @override Widget build(BuildContext context) => Center(child: Text(msg, style: GoogleFonts.inter(color: ReonColors.textMuted, fontSize: 14)));
}
