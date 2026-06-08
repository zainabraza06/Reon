import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/chat_list_item.dart';
import '../models/group_chat.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../widgets/chat_avatar.dart';
import 'chat_screen.dart';
import 'group_chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});
  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  final _search = TextEditingController();
  String _q = '';

  List<ChatListItem> _chats = [];
  List<GroupChat> _groups = [];
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
    _search.dispose();
    SocketService.instance.off('new-message', _onNewMsg);
    SocketService.instance.off('new-group-message', _onNewGroupMsg);
    SocketService.instance.off('user-status-changed', _onStatus);
    SocketService.instance.off('friend-removed', _onFriendRemoved);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.instance.getSidebarChats(),
        ApiService.instance.getGroups(),
      ]);
      if (mounted)
        setState(() {
          _chats = results[0] as List<ChatListItem>;
          _groups = results[1] as List<GroupChat>;
          _loading = false;
        });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _listenSocket() {
    SocketService.instance.on('new-message', _onNewMsg);
    SocketService.instance.on('new-group-message', _onNewGroupMsg);
    SocketService.instance.on('user-status-changed', _onStatus);
    SocketService.instance.on('friend-removed', _onFriendRemoved);
  }

  void _onNewMsg(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final sender = m['sender'] as String?;
    final sentAt = m['sentAt'] as String?;
    if (sender == null) return;
    setState(() {
      final idx = _chats.indexWhere((c) => c.id == sender);
      if (idx >= 0) {
        _chats[idx] = ChatListItem(
          id: _chats[idx].id,
          fullName: _chats[idx].fullName,
          username: _chats[idx].username,
          profilePic: _chats[idx].profilePic,
          isOnline: _chats[idx].isOnline,
          lastMessageAt: sentAt != null ? DateTime.tryParse(sentAt) : null,
          unreadCount: _chats[idx].unreadCount + 1,
        );
      }
    });
  }

  void _onNewGroupMsg(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final gid = m['groupId'] as String?;
    if (gid == null) return;
    setState(() {
      final idx = _groups.indexWhere((g) => g.id == gid);
      if (idx >= 0) _groups[idx] = _groups[idx]; // triggers rebuild
    });
  }

  void _onStatus(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final uid = m['userId'] as String?;
    if (uid == null) return;
    final online = m['isOnline'] as bool? ?? false;
    setState(() {
      for (final c in _chats) {
        if (c.id == uid) c.isOnline = online;
      }
    });
  }

  void _onFriendRemoved(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final removedId = m['friendId'] as String? ?? m['userId'] as String?;
    if (removedId != null)
      setState(() => _chats.removeWhere((c) => c.id == removedId));
  }

  String _fmt(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day)
      return DateFormat('HH:mm').format(dt);
    if (now.difference(dt).inDays < 7) return DateFormat('EEE').format(dt);
    return DateFormat('dd/MM').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filteredChats = _q.isEmpty
        ? _chats
        : _chats
            .where((c) => c.fullName.toLowerCase().contains(_q.toLowerCase()))
            .toList();
    final filteredGroups = _q.isEmpty
        ? _groups
        : _groups
            .where((g) => g.name.toLowerCase().contains(_q.toLowerCase()))
            .toList();

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: Column(children: [
        // Header
        Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 8,
                left: 16,
                right: 16,
                bottom: 12),
            child: Row(children: [
              ShaderMask(
                  shaderCallback: (b) => kBrandGradient.createShader(b),
                  child: Text('Reon',
                      style: GoogleFonts.inter(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: Colors.white))),
              const Spacer(),
              IconButton(
                  icon: Icon(Icons.refresh_rounded,
                      color:
                          isDark ? ReonColors.textMuted : Colors.grey.shade500),
                  onPressed: _load,
                  tooltip: 'Refresh'),
            ])),
        // Search
        Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: TextField(
                controller: _search,
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(
                    hintText: 'Search conversations',
                    hintStyle: GoogleFonts.inter(
                        fontSize: 13, color: ReonColors.textMuted),
                    prefixIcon: const Icon(Icons.search,
                        size: 18, color: ReonColors.textMuted),
                    filled: true,
                    fillColor:
                        isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 11),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                            color: ReonColors.primary, width: 1.5))))),
        // Tabs
        Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Container(
                height: 36,
                decoration: BoxDecoration(
                    color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(10)),
                child: TabBar(
                    controller: _tab,
                    labelStyle: GoogleFonts.inter(
                        fontSize: 13, fontWeight: FontWeight.w600),
                    unselectedLabelStyle: GoogleFonts.inter(
                        fontSize: 13, fontWeight: FontWeight.w500),
                    labelColor: Colors.white,
                    unselectedLabelColor: ReonColors.textMuted,
                    indicator: BoxDecoration(
                        gradient: kBrandGradient,
                        borderRadius: BorderRadius.circular(8),
                        boxShadow: [
                          BoxShadow(
                              color: ReonColors.primary.withValues(alpha: 0.3),
                              blurRadius: 6)
                        ]),
                    indicatorSize: TabBarIndicatorSize.tab,
                    dividerColor: Colors.transparent,
                    tabs: const [Tab(text: 'Chats'), Tab(text: 'Groups')]))),
        Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(controller: _tab, children: [
                    // DMs
                    filteredChats.isEmpty
                        ? _Empty(
                            'No conversations yet\nAdd friends to start chatting')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                                itemCount: filteredChats.length,
                                itemBuilder: (_, i) {
                                  final c = filteredChats[i];
                                  return _ChatTile(
                                      name: c.fullName,
                                      subtitle: c.previewText,
                                      avatar: c.profilePic,
                                      isOnline: c.isOnline,
                                      time: _fmt(c.lastMessageAt),
                                      unread: c.unreadCount,
                                      onTap: () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                              builder: (_) => ChatScreen(
                                                  userId: c.id,
                                                  userName: c.fullName,
                                                  userAvatar: c.profilePic))));
                                })),
                    // Groups
                    filteredGroups.isEmpty
                        ? _Empty('No groups yet')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                                itemCount: filteredGroups.length,
                                itemBuilder: (_, i) {
                                  final g = filteredGroups[i];
                                  return _ChatTile(
                                      name: g.name,
                                      subtitle: g.lastMessageContent ??
                                          'No messages yet',
                                      avatar: g.avatar,
                                      isOnline: false,
                                      time: _fmt(g.lastMessageAt),
                                      unread: 0,
                                      onTap: () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                              builder: (_) => GroupChatScreen(
                                                  groupId: g.id,
                                                  groupName: g.name))));
                                })),
                  ])),
      ]),
    );
  }
}

class _ChatTile extends StatelessWidget {
  final String name, subtitle, time;
  final String? avatar;
  final bool isOnline;
  final int unread;
  final VoidCallback onTap;
  const _ChatTile(
      {required this.name,
      required this.subtitle,
      this.avatar,
      required this.isOnline,
      required this.time,
      required this.unread,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
              border: Border(
                  bottom: BorderSide(
                      color: isDark
                          ? ReonColors.borderDark.withValues(alpha: 0.4)
                          : const Color(0xFFF0F0F0)))),
          child: Row(children: [
            ChatAvatar(
                name: name, imageUrl: avatar, size: 50, isOnline: isOnline),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Row(children: [
                    Expanded(
                        child: Text(name,
                            style: GoogleFonts.inter(
                                fontWeight: FontWeight.w600,
                                fontSize: 14.5,
                                color: isDark
                                    ? ReonColors.textDark
                                    : ReonColors.textLight),
                            overflow: TextOverflow.ellipsis)),
                    Text(time,
                        style: GoogleFonts.inter(
                            fontSize: 11.5,
                            color: unread > 0
                                ? ReonColors.primary
                                : ReonColors.textMuted)),
                  ]),
                  const SizedBox(height: 3),
                  Row(children: [
                    Expanded(
                        child: Text(subtitle,
                            style: GoogleFonts.inter(
                                fontSize: 13,
                                color: ReonColors.textMuted,
                                fontWeight: unread > 0
                                    ? FontWeight.w500
                                    : FontWeight.w400),
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1)),
                    if (unread > 0) ...[
                      const SizedBox(width: 8),
                      Container(
                          height: 20,
                          constraints: const BoxConstraints(minWidth: 20),
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          decoration: BoxDecoration(
                              gradient: kBrandGradient,
                              borderRadius: BorderRadius.circular(99)),
                          child: Center(
                              child: Text('$unread',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700))))
                    ],
                  ]),
                ])),
          ]),
        ));
  }
}

class _Empty extends StatelessWidget {
  final String message;
  const _Empty(this.message);
  @override
  Widget build(BuildContext context) => Center(
      child: Text(message,
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(
              color: ReonColors.textMuted, fontSize: 14, height: 1.6)));
}
