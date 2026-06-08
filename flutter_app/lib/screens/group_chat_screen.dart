import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../models/group_chat.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../services/crypto_service.dart';
import '../widgets/chat_avatar.dart';

class GroupChatScreen extends StatefulWidget {
  final String groupId;
  final String groupName;

  const GroupChatScreen(
      {super.key, required this.groupId, required this.groupName});
  @override
  State<GroupChatScreen> createState() => _GroupChatScreenState();
}

class _GroupChatScreenState extends State<GroupChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  List<GroupMessage> _messages = [];
  GroupChat? _group;
  bool _loading = true;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _loadGroup();
    _listenSocket();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    SocketService.instance.off('new-group-message', _onNewMsg);
    SocketService.instance.off('group-message-delivered', _onDelivered);
    SocketService.instance.off('group-messages-read', _onRead);
    super.dispose();
  }

  // ── Load ──────────────────────────────────────────────────────────────────────

  Future<void> _loadMessages({String? before}) async {
    setState(() => _loading = true);
    try {
      final raw = await ApiService.instance
          .getGroupMessages(widget.groupId, before: before);
      if (!mounted) return;
      final myId = context.read<AuthProvider>().user!.id;
      final dec = await Future.wait(raw.map((m) => _decrypt(m, myId)));
      if (mounted) {
        setState(() {
          _messages = before != null ? [...dec, ..._messages] : dec;
          _hasMore = raw.length == 50;
          _loading = false;
        });
      }
      _scrollToBottom();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  Future<void> _loadGroup() async {
    try {
      final g = await ApiService.instance.getGroup(widget.groupId);
      if (mounted) setState(() => _group = g);
    } catch (_) {}
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────────

  Future<GroupMessage> _decrypt(GroupMessage m, String myId) async {
    if (m.ciphertext == null || m.encryptedKey == null) return m;
    final plain = await CryptoService.instance
        .decryptText(m.ciphertext!, m.encryptedKey!);
    return m.copyWith(plaintext: plain ?? '[decryption failed]');
  }

  // ── Send ──────────────────────────────────────────────────────────────────────

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _group == null) return;
    _input.clear();

    // Gather member public keys
    final memberKeys = <Map<String, dynamic>>[];
    for (final mem in _group!.members) {
      try {
        final jwkStr = await ApiService.instance.tryGetPublicKey(mem.user.id);
        if (jwkStr != null) {
          memberKeys.add({
            'userId': mem.user.id,
            'encryptedKey': await _encryptForMember(text, jwkStr)
          });
        }
      } catch (_) {}
    }
    if (memberKeys.isEmpty) return;

    // Encrypt using sender's own key for self-reading
    final myPubJwk = await CryptoService.instance.getStoredPublicKey();
    String ciphertext = text;
    if (myPubJwk != null && memberKeys.isNotEmpty) {
      // Use first member key's AES as base — actually re-encrypt with groupText logic
      // For simplicity: encrypt text with our own key first, then distribute per member
      final enc = await CryptoService.instance.encryptText(text,
          memberKeys.first['_pubJwk'] as Map<String, dynamic>? ?? myPubJwk);
      ciphertext = enc.ciphertext;
    }

    final payload = jsonEncode({
      'ciphertext': ciphertext,
      'contentType': 'text',
      'memberKeys': memberKeys
    });
    final fd = FormData.fromMap({'data': payload});

    try {
      final sent =
          await ApiService.instance.sendGroupMessage(widget.groupId, fd);
      final dec = sent.copyWith(plaintext: text);
      if (mounted) {
        setState(() {
          if (!_messages.any((m) => m.id == dec.id)) {
            _messages.add(dec);
          }
        });
      }
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Send failed: $e')));
      }
    }
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  Future<String> _encryptForMember(String text, String pubJwkStr) async {
    final jwk = jsonDecode(pubJwkStr) as Map<String, dynamic>;
    final enc = await CryptoService.instance.encryptText(text, jwk);
    return enc.encryptedKey;
  }

  // ── Socket ────────────────────────────────────────────────────────────────────

  void _listenSocket() {
    SocketService.instance.on('new-group-message', _onNewMsg);
    SocketService.instance.on('group-message-delivered', _onDelivered);
    SocketService.instance.on('group-messages-read', _onRead);
  }

  void _onNewMsg(dynamic d) async {
    final m = d as Map?;
    if (m == null) return;
    if ((m['groupId'] as String?) != widget.groupId) return;
    final msg =
        GroupMessage.fromJson(Map<String, dynamic>.from(m['message'] as Map));
    if (_messages.any((e) => e.id == msg.id)) return;
    final myId = context.read<AuthProvider>().user?.id ?? '';
    final dec = await _decrypt(msg, myId);
    if (mounted) setState(() => _messages.add(dec));
    _scrollToBottom();
    // Tell sender we received it
    SocketService.instance.emit('group-message-delivered',
        {'messageId': msg.id, 'groupId': widget.groupId});
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  void _onDelivered(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final mid = m['messageId'] as String?;
    if (mid == null) return;
    final count = m['deliveredCount'] as int? ?? 0;
    if (mounted) {
      setState(() {
        _messages = [
          for (final msg in _messages)
            msg.id == mid
                ? msg.copyWith(
                    deliveredTo: List.generate(
                        count + 1,
                        (i) => {
                              'userId': i == 0
                                  ? (context.read<AuthProvider>().user?.id ??
                                      '')
                                  : 'member_$i',
                              'at': DateTime.now().toIso8601String()
                            }))
                : msg
        ];
      });
    }
  }

  void _onRead(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    if ((m['groupId'] as String?) != widget.groupId) return;
    final ids = List<String>.from(
        (m['messageIds'] as List? ?? []).map((e) => e as String));
    final by = m['readBy'] as String? ?? '';
    final idSet = ids.toSet();
    if (mounted) {
      setState(() {
        _messages = [
          for (final msg in _messages)
            idSet.contains(msg.id)
                ? msg.copyWith(readBy: [
                    ...msg.readBy,
                    {'userId': by, 'at': DateTime.now().toIso8601String()}
                  ])
                : msg
        ];
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  void _scrollToBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(_scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut);
        }
      });

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final me = context.watch<AuthProvider>().user!;
    final memberCount = (_group?.memberCount ?? 1) - 1;

    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF080816) : const Color(0xFFEEF2FF),
      appBar: AppBar(
          backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
          elevation: 0,
          titleSpacing: 0,
          leading: IconButton(
              icon: Icon(Icons.arrow_back_ios_new,
                  size: 18,
                  color: isDark ? Colors.white : ReonColors.textLight),
              onPressed: () => Navigator.of(context).pop()),
          title: Row(children: [
            ChatAvatar(name: widget.groupName, size: 38),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                  Text(widget.groupName,
                      style: GoogleFonts.inter(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: isDark ? Colors.white : ReonColors.textLight)),
                  Text('${_group?.memberCount ?? 0} members',
                      style: GoogleFonts.inter(
                          fontSize: 12, color: ReonColors.textMuted)),
                ])),
          ])),
      body: Column(children: [
        if (_hasMore && !_loading)
          GestureDetector(
              onTap: () => _loadMessages(
                  before: _messages.first.sentAt.toIso8601String()),
              child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text('Load earlier',
                      style: GoogleFonts.inter(
                          fontSize: 12,
                          color: ReonColors.primary,
                          fontWeight: FontWeight.w600)))),
        Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : CustomPaint(
                    painter: _DotGrid(isDark: isDark),
                    child: ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) {
                          final msg = _messages[i];
                          final isMine = msg.sender.id == me.id;
                          return _GroupBubble(
                              message: msg,
                              isMine: isMine,
                              memberCount: memberCount,
                              myId: me.id);
                        }))),
        // Input
        Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: EdgeInsets.only(
                left: 8,
                right: 8,
                top: 8,
                bottom: MediaQuery.of(context).padding.bottom + 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                  child: Container(
                constraints: const BoxConstraints(maxHeight: 120),
                decoration: BoxDecoration(
                    color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(22)),
                child: TextField(
                    controller: _input,
                    maxLines: null,
                    style: GoogleFonts.inter(
                        fontSize: 14.5,
                        color: isDark
                            ? ReonColors.textDark
                            : ReonColors.textLight),
                    decoration: InputDecoration(
                        hintText: 'Message ${widget.groupName}…',
                        hintStyle: GoogleFonts.inter(
                            fontSize: 14.5, color: ReonColors.textMuted),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        border: InputBorder.none)),
              )),
              const SizedBox(width: 6),
              GestureDetector(
                  onTap: _send,
                  child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                          gradient: kBrandGradient,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                                color:
                                    ReonColors.primary.withValues(alpha: 0.35),
                                blurRadius: 10,
                                offset: const Offset(0, 3))
                          ]),
                      child: const Icon(Icons.send_rounded,
                          color: Colors.white, size: 20))),
            ])),
      ]),
    );
  }
}

// ── Group message bubble ───────────────────────────────────────────────────────

class _GroupBubble extends StatelessWidget {
  final GroupMessage message;
  final bool isMine;
  final int memberCount;
  final String myId;
  const _GroupBubble(
      {required this.message,
      required this.isMine,
      required this.memberCount,
      required this.myId});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final time = DateFormat('HH:mm').format(message.sentAt);
    final text = message.plaintext ?? message.ciphertext;
    final senderName = message.sender.fullName;

    return Padding(
      padding: EdgeInsets.only(
          top: 2, bottom: 2, left: isMine ? 64 : 12, right: isMine ? 12 : 64),
      child: Column(
          crossAxisAlignment:
              isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isMine)
              Row(children: [
                ChatAvatar(
                    name: senderName,
                    imageUrl: message.sender.profilePic,
                    size: 20),
                const SizedBox(width: 6),
                Text(senderName,
                    style: GoogleFonts.inter(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: ReonColors.primary)),
              ]),
            const SizedBox(height: 2),
            Container(
              decoration: isMine
                  ? gradientBubbleDecoration(roundBR: false)
                  : BoxDecoration(
                      color: isDark ? ReonColors.cardDark : Colors.white,
                      borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(4),
                          topRight: Radius.circular(18),
                          bottomLeft: Radius.circular(18),
                          bottomRight: Radius.circular(18)),
                      boxShadow: [
                          BoxShadow(
                              color: Colors.black
                                  .withValues(alpha: isDark ? 0.25 : 0.06),
                              blurRadius: 6,
                              offset: const Offset(0, 2))
                        ]),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (text != null)
                      Text(text,
                          style: GoogleFonts.inter(
                              fontSize: 14.5,
                              height: 1.45,
                              color: isMine
                                  ? Colors.white
                                  : (isDark
                                      ? ReonColors.textDark
                                      : ReonColors.textLight))),
                    const SizedBox(height: 4),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(time,
                          style: GoogleFonts.inter(
                              fontSize: 11,
                              color: isMine
                                  ? Colors.white.withValues(alpha: 0.6)
                                  : ReonColors.textMuted)),
                      if (isMine) ...[
                        const SizedBox(width: 3),
                        _GroupTick(
                            senderId: message.sender.id,
                            readBy: message.readBy,
                            deliveredTo: message.deliveredTo,
                            memberCount: memberCount)
                      ],
                    ]),
                  ]),
            ),
          ]),
    );
  }
}

class _GroupTick extends StatelessWidget {
  final String senderId;
  final List<Map<String, dynamic>> readBy, deliveredTo;
  final int memberCount;
  const _GroupTick(
      {required this.senderId,
      required this.readBy,
      required this.deliveredTo,
      required this.memberCount});

  @override
  Widget build(BuildContext context) {
    final otherRead = readBy.where((r) => r['userId'] != senderId).length;
    final otherDelivered =
        deliveredTo.where((d) => d['userId'] != senderId).length;
    final allRead = memberCount > 0 && otherRead >= memberCount;

    if (allRead) {
      return Icon(Icons.done_all_rounded,
          size: 14, color: ReonColors.accent.withValues(alpha: 0.9));
    }
    if (otherDelivered > 0) {
      return Icon(Icons.done_all_rounded,
          size: 14, color: Colors.white.withValues(alpha: 0.6));
    }
    return Icon(Icons.done_rounded,
        size: 14, color: Colors.white.withValues(alpha: 0.5));
  }
}

class _DotGrid extends CustomPainter {
  final bool isDark;
  const _DotGrid({required this.isDark});
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()
      ..color = ReonColors.primary.withValues(alpha: isDark ? 0.18 : 0.07)
      ..style = PaintingStyle.fill;
    for (double x = 0; x < s.width; x += 22) {
      for (double y = 0; y < s.height; y += 22) {
        c.drawCircle(Offset(x, y), 1, p);
      }
    }
  }

  @override
  bool shouldRepaint(_DotGrid o) => o.isDark != isDark;
}
