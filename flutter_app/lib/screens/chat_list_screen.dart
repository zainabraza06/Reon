import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../models/chat_list_item.dart';
import '../models/group_chat.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';
import '../services/message_cache_service.dart';
import '../services/socket_service.dart';
import '../widgets/chat_avatar.dart';
import 'chat_screen.dart';
import 'group_chat_screen.dart';
import 'create_group_screen.dart';

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
    _tab.addListener(() => setState(() {}));
    _load();
    _listenSocket();
  }

  @override
  void dispose() {
    _tab.dispose();
    _search.dispose();
    SocketService.instance.off('new-message', _onNewMsg);
    SocketService.instance.off('message-sent', _onMsgSent);
    SocketService.instance.off('new-group-message', _onNewGroupMsg);
    SocketService.instance.off('user-status-changed', _onStatus);
    SocketService.instance.off('friend-removed', _onFriendRemoved);
    SocketService.instance.off('socket_reconnected', _onReconnect);
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.instance.getSidebarChats(),
        ApiService.instance.getGroups(),
      ]);
      if (!mounted) return;
      final myId = context.read<AuthProvider>().user?.id ?? '';
      final chats = results[0] as List<ChatListItem>;
      final groups = results[1] as List<GroupChat>;

      // Show items immediately, then decrypt previews in background
      if (mounted) {
        setState(() {
          _chats = chats;
          _groups = groups;
          if (!silent) _loading = false;
        });
      }
      await _decryptPreviews(myId, chats, groups);
    } catch (_) {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  Future<void> _decryptPreviews(
    String myId,
    List<ChatListItem> chats,
    List<GroupChat> groups,
  ) async {
    // Decrypt DM last messages — try message cache first, then RSA decryption
    final decryptedChats = <ChatListItem>[];
    var anyChanged = false;
    for (final c in chats) {
      if (c.lastMessageContent == null && c.lastMessageAt != null) {
        String? plain;

        // 1. Try RSA decryption (most up-to-date — last message from API)
        if (c.lastMessageType == 'text' &&
            c.lastMessageCiphertext != null &&
            c.lastMessageCiphertext!.isNotEmpty &&
            c.lastMessageEncryptedKey != null &&
            c.lastMessageEncryptedKey!.isNotEmpty) {
          try {
            plain = await CryptoService.instance
                .decryptText(c.lastMessageCiphertext!, c.lastMessageEncryptedKey!);
          } catch (_) {}
        }

        // 2. Fall back to message cache when RSA decryption can't produce a result
        //    (e.g. old messages stored without senderEncryptedKey)
        if ((plain == null || plain.isEmpty) && c.lastMessageType == 'text') {
          try {
            final cached = await MessageCacheService.instance.load(c.id);
            if (cached.isNotEmpty) {
              final last = cached.last;
              if (last.contentType == 'text' &&
                  last.plaintext != null &&
                  last.plaintext!.isNotEmpty) {
                plain = last.plaintext;
              }
            }
          } catch (_) {}
        }

        if (plain != null && plain.isNotEmpty) {
          decryptedChats.add(ChatListItem(
            id: c.id,
            fullName: c.fullName,
            username: c.username,
            profilePic: c.profilePic,
            lastMessageContent: plain,
            lastMessageType: c.lastMessageType,
            lastSenderId: c.lastSenderId,
            lastMessageAt: c.lastMessageAt,
            unreadCount: c.unreadCount,
            isOnline: c.isOnline,
          ));
          anyChanged = true;
          continue;
        }
      }
      decryptedChats.add(c);
    }

    // Decrypt group last messages
    final decryptedGroups = <GroupChat>[];
    for (final g in groups) {
      if (g.lastMessageType == 'text' &&
          g.lastMessageCiphertext != null &&
          g.lastMessageCiphertext!.isNotEmpty &&
          g.lastMessageMemberKeys != null &&
          g.lastMessageContent == null) {
        String? encKey;
        for (final k in g.lastMessageMemberKeys!) {
          if (k['userId']?.toString() == myId) {
            encKey = k['encryptedKey'] as String?;
            break;
          }
        }
        if (encKey != null && encKey.isNotEmpty) {
          try {
            final plain = await CryptoService.instance
                .decryptText(g.lastMessageCiphertext!, encKey);
            if (plain != null && plain.isNotEmpty) {
              decryptedGroups.add(GroupChat(
                id: g.id,
                name: g.name,
                description: g.description,
                avatar: g.avatar,
                creator: g.creator,
                admins: g.admins,
                members: g.members,
                lastMessageContent: plain,
                lastMessageType: g.lastMessageType,
                lastSenderName: g.lastSenderName,
                lastMessageAt: g.lastMessageAt,
              ));
              anyChanged = true;
              continue;
            }
          } catch (_) {}
        }
      }
      decryptedGroups.add(g);
    }

    if (anyChanged && mounted) {
      setState(() {
        _chats = decryptedChats;
        _groups = decryptedGroups;
      });
    }
  }

  void _onReconnect(_) => _load(silent: true);

  void _listenSocket() {
    SocketService.instance.on('new-message', _onNewMsg);
    SocketService.instance.on('message-sent', _onMsgSent);
    SocketService.instance.on('new-group-message', _onNewGroupMsg);
    SocketService.instance.on('user-status-changed', _onStatus);
    SocketService.instance.on('friend-removed', _onFriendRemoved);
    SocketService.instance.on('socket_reconnected', _onReconnect);
  }

  void _onNewMsg(dynamic d) async {
    final m = d as Map?;
    if (m == null) return;
    final sender = m['sender'] as String?;
    final sentAt = m['sentAt'] as String?;
    final contentType = m['contentType'] as String? ?? 'text';
    if (sender == null) return;

    String? plaintext;
    if (contentType == 'text') {
      final ciphertext = m['ciphertext'] as String? ?? '';
      final encKey = m['encryptedKey'] as String? ?? '';
      if (ciphertext.isNotEmpty && encKey.isNotEmpty) {
        try {
          plaintext =
              await CryptoService.instance.decryptText(ciphertext, encKey);
        } catch (_) {}
      }
    }

    if (!mounted) return;
    setState(() {
      final idx = _chats.indexWhere((c) => c.id == sender);
      if (idx >= 0) {
        final prev = _chats[idx];
        _chats[idx] = ChatListItem(
          id: prev.id,
          fullName: prev.fullName,
          username: prev.username,
          profilePic: prev.profilePic,
          isOnline: prev.isOnline,
          lastMessageAt: sentAt != null ? DateTime.tryParse(sentAt) : null,
          lastMessageType: contentType,
          lastSenderId: sender,
          lastMessageContent: plaintext,
          unreadCount: prev.unreadCount + 1,
        );
      }
    });
  }

  void _onMsgSent(dynamic d) async {
    if (!mounted) return;
    final m = d as Map?;
    if (m == null) return;
    final receiver = m['receiver'] as String?;
    if (receiver == null) return;
    final sentAt = m['sentAt'] as String?;
    final contentType = m['contentType'] as String? ?? 'text';
    final myId = context.read<AuthProvider>().user?.id ?? '';

    String? plaintext;
    if (contentType == 'text') {
      final ciphertext = m['ciphertext'] as String? ?? '';
      final encKey = m['encryptedKey'] as String? ?? '';
      if (ciphertext.isNotEmpty && encKey.isNotEmpty) {
        try {
          plaintext =
              await CryptoService.instance.decryptText(ciphertext, encKey);
        } catch (_) {}
      }
    }

    if (!mounted) return;
    setState(() {
      final idx = _chats.indexWhere((c) => c.id == receiver);
      if (idx >= 0) {
        final prev = _chats[idx];
        _chats[idx] = ChatListItem(
          id: prev.id,
          fullName: prev.fullName,
          username: prev.username,
          profilePic: prev.profilePic,
          isOnline: prev.isOnline,
          lastMessageAt: sentAt != null
              ? DateTime.tryParse(sentAt)
              : prev.lastMessageAt,
          lastMessageType: contentType,
          lastSenderId: myId,
          lastMessageContent: plaintext,
          unreadCount: prev.unreadCount,
        );
      }
    });
  }

  void _onNewGroupMsg(dynamic d) async {
    if (!mounted) return;
    final m = d as Map?;
    if (m == null) return;
    final gid = m['groupId'] as String?;
    if (gid == null) return;
    final msg = m['message'] as Map?;
    final contentType = msg?['contentType'] as String? ?? 'text';
    final sentAt = msg?['sentAt'] as String?;
    if (contentType == 'system') return;

    final senderInfo = msg?['sender'] as Map?;
    final senderName = senderInfo?['fullName'] as String?;

    String preview = _typeToPreview(contentType);
    bool decryptionAttempted = false;
    if (contentType == 'text') {
      final myId = context.read<AuthProvider>().user?.id ?? '';
      final memberKeys = msg?['memberKeys'] as List? ?? [];
      String? encKey;
      for (final k in memberKeys) {
        final entry = k as Map;
        if (entry['userId']?.toString() == myId) {
          encKey = entry['encryptedKey'] as String?;
          break;
        }
      }
      final ciphertext = msg?['ciphertext'] as String? ?? '';
      if (ciphertext.isNotEmpty && encKey != null && encKey.isNotEmpty) {
        decryptionAttempted = true;
        try {
          final plain = await CryptoService.instance
              .decryptText(ciphertext, encKey);
          if (plain != null) preview = plain;
        } catch (_) {}
      }
    }

    if (!mounted) return;
    setState(() {
      final idx = _groups.indexWhere((g) => g.id == gid);
      if (idx >= 0) {
        final g = _groups[idx];
        _groups[idx] = GroupChat(
          id: g.id,
          name: g.name,
          description: g.description,
          avatar: g.avatar,
          creator: g.creator,
          admins: g.admins,
          members: g.members,
          lastMessageContent: preview,
          lastMessageType: contentType,
          lastSenderName: senderName,
          lastMessageAt:
              sentAt != null ? DateTime.tryParse(sentAt) : g.lastMessageAt,
        );
      }
    });

    // If decryption was attempted but fell back to placeholder, reload after a
    // short delay so the correct preview appears once the key is available.
    if (decryptionAttempted && preview == _typeToPreview(contentType)) {
      Future.delayed(const Duration(milliseconds: 800), () {
        if (mounted) _load(silent: true);
      });
    }
  }

  static String _typeToPreview(String type) {
    switch (type) {
      case 'image':    return '📷 Photo';
      case 'video':    return '🎥 Video';
      case 'audio':    return '🎤 Voice message';
      case 'document': return '📄 Document';
      default:         return '💬 New message';
    }
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

  Future<void> _openCreateGroup() async {
    final created = await Navigator.push<bool>(
        context, MaterialPageRoute(builder: (_) => const CreateGroupScreen()));
    if (created == true) _load();
  }

  void _onFriendRemoved(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final removedId = m['friendId'] as String? ?? m['userId'] as String?;
    if (removedId != null) {
      setState(() => _chats.removeWhere((c) => c.id == removedId));
    }
  }

  String _fmt(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return DateFormat('HH:mm').format(dt);
    }
    if (now.difference(dt).inDays < 7) {
      return DateFormat('EEE').format(dt);
    }
    return DateFormat('dd/MM').format(dt);
  }

  String _groupSubtitle(GroupChat g) {
    if (g.lastMessageAt == null) return 'No messages yet';
    final content = g.lastMessageContent ??
        _typeToPreview(g.lastMessageType ?? 'text');
    if (g.lastSenderName != null) return '${g.lastSenderName}: $content';
    return content;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final myId = context.read<AuthProvider>().user?.id ?? '';
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
      floatingActionButton: (_tab.index == 1 && _groups.isNotEmpty)
          ? FloatingActionButton.extended(
              onPressed: _openCreateGroup,
              backgroundColor: ReonColors.primary,
              icon: const Icon(Icons.group_add_rounded, color: Colors.white),
              label: Text('New Group',
                  style: GoogleFonts.inter(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            )
          : null,
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
                        ? const _Empty(
                            'No conversations yet\nAdd friends to start chatting')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                                itemCount: filteredChats.length,
                                itemBuilder: (_, i) {
                                  final c = filteredChats[i];
                                  return _ChatTile(
                                      name: c.fullName,
                                      subtitle: c.previewTextFor(myId),
                                      avatar: c.profilePic,
                                      isOnline: c.isOnline,
                                      time: _fmt(c.lastMessageAt),
                                      unread: c.unreadCount,
                                      onTap: () async {
                                        await Navigator.of(context).push(
                                            MaterialPageRoute(
                                                builder: (_) => ChatScreen(
                                                    userId: c.id,
                                                    userName: c.fullName,
                                                    userAvatar: c.profilePic)));
                                        if (!mounted) return;
                                        // Clear unread badge immediately
                                        final idx = _chats.indexWhere((x) => x.id == c.id);
                                        if (idx >= 0) {
                                          setState(() {
                                            final p = _chats[idx];
                                            _chats[idx] = ChatListItem(
                                              id: p.id, fullName: p.fullName,
                                              username: p.username, profilePic: p.profilePic,
                                              isOnline: p.isOnline, lastMessageAt: p.lastMessageAt,
                                              lastMessageType: p.lastMessageType,
                                              lastSenderId: p.lastSenderId,
                                              lastMessageContent: p.lastMessageContent,
                                              unreadCount: 0,
                                            );
                                          });
                                        }
                                        // Silent reload to re-decrypt preview if it was missing
                                        _load(silent: true);
                                      });
                                })),
                    // Groups
                    filteredGroups.isEmpty
                        ? _EmptyGroups(onCreateTap: _openCreateGroup)
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                                itemCount: filteredGroups.length,
                                itemBuilder: (_, i) {
                                  final g = filteredGroups[i];
                                  return _ChatTile(
                                      name: g.name,
                                      subtitle: _groupSubtitle(g),
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

class _EmptyGroups extends StatelessWidget {
  final VoidCallback onCreateTap;
  const _EmptyGroups({required this.onCreateTap});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.group_outlined, color: ReonColors.textMuted, size: 48),
          const SizedBox(height: 12),
          Text('No groups yet',
              style: GoogleFonts.inter(
                  color: ReonColors.textMuted,
                  fontSize: 15,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Create a group to chat with\nmultiple friends at once',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                  color: ReonColors.textMuted, fontSize: 13, height: 1.5)),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: onCreateTap,
            style: FilledButton.styleFrom(backgroundColor: ReonColors.primary),
            icon: const Icon(Icons.group_add_rounded),
            label: const Text('Create Group'),
          ),
        ]),
      );
}

