import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../models/message.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../services/crypto_service.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends StatefulWidget {
  final String userId;
  final String userName;
  final String? userAvatar;

  const ChatScreen({
    super.key,
    required this.userId,
    required this.userName,
    this.userAvatar,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input  = TextEditingController();
  final _scroll = ScrollController();

  List<ChatMessage> _messages = [];
  bool _loading    = true;
  bool _hasMore    = true;
  bool _isTyping   = false;
  bool _isOnline   = false;
  bool _sending    = false;
  ReonUser? _recipient;

  // Cache recipient's public key JWK (map) for the session
  Map<String, dynamic>? _recipientPubJwk;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _loadRecipient();
    _listenSocket();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    final s = SocketService.instance;
    s.off('new-message',              _onNewMsg);
    s.off('message-sent',             _onMsgSent);
    s.off('message-delivered',        _onDelivered);
    s.off('messages-delivered-batch', _onDeliveredBatch);
    s.off('message-read',             _onRead);
    s.off('user-typing',              _onTyping);
    s.off('user-status-changed',      _onStatus);
    super.dispose();
  }

  // ── Load ──────────────────────────────────────────────────────────────────────

  Future<void> _loadMessages({String? before}) async {
    if (!_hasMore && before != null) return;
    setState(() => _loading = true);
    try {
      final raw = await ApiService.instance.getMessages(widget.userId, before: before);
      final myId = context.read<AuthProvider>().user!.id;
      final decrypted = await Future.wait(raw.map((m) => _decrypt(m, myId)));
      if (mounted) setState(() {
        _messages = before != null ? [...decrypted, ..._messages] : decrypted;
        _hasMore  = raw.length == 50;
        _loading  = false;
      });
      _scrollToBottom();
    } catch (_) { if (mounted) setState(() => _loading = false); }
    await ApiService.instance.markChatRead(widget.userId).catchError((_) {});
  }

  Future<void> _loadRecipient() async {
    try {
      final friends = await ApiService.instance.getFriends();
      _recipient = friends.firstWhere((f) => f.id == widget.userId, orElse: () => ReonUser(id: widget.userId, fullName: widget.userName, email: ''));
    } catch (_) {
      _recipient = ReonUser(id: widget.userId, fullName: widget.userName, email: '');
    }
    try {
      final jwkStr = await ApiService.instance.tryGetPublicKey(widget.userId);
      if (jwkStr != null) _recipientPubJwk = jsonDecode(jwkStr) as Map<String, dynamic>;
    } catch (_) {}
    if (mounted) setState(() {});
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────────

  Future<ChatMessage> _decrypt(ChatMessage m, String myId) async {
    if (m.ciphertext == null || m.encryptedKey == null) return m;
    final plain = await CryptoService.instance.decryptText(m.ciphertext!, m.encryptedKey!);
    return m.copyWith(plaintext: plain ?? '[decryption failed]');
  }

  // ── Send ──────────────────────────────────────────────────────────────────────

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    _input.clear();
    setState(() => _sending = true);

    final myId   = context.read<AuthProvider>().user!.id;
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';

    final optimistic = ChatMessage(
      id: tempId, sender: myId, receiver: widget.userId,
      plaintext: text, contentType: 'text', sentAt: DateTime.now(), status: 'sending',
    );
    setState(() { _messages.add(optimistic); _sending = false; });
    _scrollToBottom();

    try {
      // Encrypt
      String ciphertext = text, encryptedKey = '', senderEncryptedKey = '';
      if (_recipientPubJwk != null) {
        final enc = await CryptoService.instance.encryptText(text, _recipientPubJwk!);
        ciphertext          = enc.ciphertext;
        encryptedKey        = enc.encryptedKey;
        senderEncryptedKey  = enc.senderEncryptedKey;
      } else {
        throw Exception('Recipient encryption key not available');
      }

      final payload = jsonEncode({
        'sender': myId, 'receiver': widget.userId, 'contentType': 'text',
        'ciphertext': ciphertext, 'encryptedKey': encryptedKey, 'senderEncryptedKey': senderEncryptedKey,
      });
      final fd = FormData.fromMap({'data': payload});
      final sent = await ApiService.instance.sendMessage(fd);
      final dec  = await _decrypt(sent.copyWith(plaintext: text), myId);

      if (mounted) setState(() {
        _messages = [
          for (final m in _messages)
            if (m.id == tempId) dec else m
        ];
      });
    } catch (e) {
      if (mounted) setState(() {
        _messages = [
          for (final m in _messages)
            if (m.id == tempId) ChatMessage(id: tempId, sender: myId, receiver: widget.userId, plaintext: text, contentType: 'text', sentAt: optimistic.sentAt, status: 'failed') else m
        ];
      });
    }
    _scrollToBottom();
  }

  // ── Socket handlers ───────────────────────────────────────────────────────────

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('new-message',              _onNewMsg);
    s.on('message-sent',             _onMsgSent);
    s.on('message-delivered',        _onDelivered);
    s.on('messages-delivered-batch', _onDeliveredBatch);
    s.on('message-read',             _onRead);
    s.on('user-typing',              _onTyping);
    s.on('user-status-changed',      _onStatus);
  }

  void _onNewMsg(dynamic d) async {
    final m   = d as Map?; if (m == null) return;
    final msg = ChatMessage.fromJson(Map<String, dynamic>.from(m));
    if (msg.sender != widget.userId && msg.receiver != widget.userId) return;
    if (_messages.any((e) => e.id == msg.id)) return;
    final myId = context.read<AuthProvider>().user?.id ?? '';
    final dec  = await _decrypt(msg, myId);
    if (mounted) setState(() => _messages.add(dec));
    _scrollToBottom();
    // Emit read receipt
    SocketService.instance.emit('message-read', {'messageId': msg.id, 'senderId': msg.sender});
    ApiService.instance.markChatRead(widget.userId).catchError((_) {});
  }

  void _onMsgSent(dynamic d) {
    final m = d as Map?; if (m == null) return;
    final id     = m['_id'] as String?; if (id == null) return;
    final status = m['status'] as String? ?? 'sent';
    if (mounted) setState(() {
      _messages = [for (final msg in _messages) msg.id == id ? msg.copyWith(status: status) : msg];
    });
  }

  void _onDelivered(dynamic d) {
    final m   = d as Map?; if (m == null) return;
    final mid = m['messageId'] as String?; if (mid == null) return;
    final at  = m['deliveredAt'] as String?;
    if (mounted) setState(() {
      _messages = [for (final msg in _messages) msg.id == mid
        ? msg.copyWith(status: 'delivered', delivered: true, deliveredAt: at != null ? DateTime.tryParse(at) : null)
        : msg];
    });
  }

  void _onDeliveredBatch(dynamic d) {
    final m    = d as Map?; if (m == null) return;
    final list = m['messages'] as List? ?? [];
    final ids  = {for (final e in list) (e as Map)['messageId'] as String? ?? ''};
    if (mounted) setState(() {
      _messages = [for (final msg in _messages) ids.contains(msg.id) ? msg.copyWith(status: 'delivered', delivered: true) : msg];
    });
  }

  void _onRead(dynamic d) {
    final m   = d as Map?; if (m == null) return;
    final mid = m['messageId'] as String?; if (mid == null) return;
    final myId = context.read<AuthProvider>().user?.id ?? '';
    if (mounted) setState(() {
      final target = _messages.firstWhere((e) => e.id == mid, orElse: () => _messages.first);
      final cutoff = target.sentAt;
      _messages = [for (final msg in _messages)
        msg.sender == myId && !msg.sentAt.isAfter(cutoff)
          ? msg.copyWith(status: 'read', read: true) : msg];
    });
  }

  void _onTyping(dynamic d) {
    final m = d as Map?; if (m == null) return;
    if ((m['senderId'] as String?) != widget.userId) return;
    if (mounted) setState(() => _isTyping = m['isTyping'] as bool? ?? false);
  }

  void _onStatus(dynamic d) {
    final m = d as Map?; if (m == null) return;
    if ((m['userId'] as String?) != widget.userId) return;
    if (mounted) setState(() => _isOnline = m['isOnline'] as bool? ?? false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  void _scrollToBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  });

  void _handleTyping(bool isTyping) {
    final me = context.read<AuthProvider>().user;
    if (me == null) return;
    SocketService.instance.emit(isTyping ? 'start-typing' : 'stop-typing', {'senderId': me.id, 'receiverId': widget.userId, 'isTyping': isTyping});
  }

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final me     = context.watch<AuthProvider>().user!;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF080816) : const Color(0xFFEEF2FF),
      appBar: AppBar(
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        elevation: 0, titleSpacing: 0,
        leading: IconButton(icon: Icon(Icons.arrow_back_ios_new, size: 18, color: isDark ? Colors.white : ReonColors.textLight), onPressed: () => Navigator.of(context).pop()),
        title: Row(children: [
          ChatAvatar(name: widget.userName, imageUrl: widget.userAvatar, size: 38, isOnline: _isOnline),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(widget.userName, style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600, color: isDark ? Colors.white : ReonColors.textLight)),
            Text(_isTyping ? 'typing…' : (_isOnline ? 'Online' : ''),
              style: GoogleFonts.inter(fontSize: 12, color: _isTyping ? ReonColors.primary : ReonColors.online)),
          ])),
        ]),
      ),
      body: Column(children: [
        // Load earlier
        if (_hasMore && !_loading)
          GestureDetector(
            onTap: () => _loadMessages(before: _messages.first.sentAt.toIso8601String()),
            child: Container(padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('Load earlier', style: GoogleFonts.inter(fontSize: 12, color: ReonColors.primary, fontWeight: FontWeight.w600))),
          ),
        Expanded(
          child: _loading && _messages.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : CustomPaint(
                painter: _DotGrid(isDark: isDark),
                child: ListView.builder(
                  controller: _scroll, padding: const EdgeInsets.symmetric(vertical: 10),
                  itemCount: _messages.length + (_isTyping ? 1 : 0),
                  itemBuilder: (_, i) {
                    if (_isTyping && i == _messages.length) return _TypingBubble(isDark: isDark);
                    final msg = _messages[i];
                    return MessageBubble(message: msg, isMine: msg.sender == me.id, recipient: _recipient);
                  }),
              )),
        // Input
        Container(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          padding: EdgeInsets.only(left: 8, right: 8, top: 8, bottom: MediaQuery.of(context).padding.bottom + 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(child: Container(
              constraints: const BoxConstraints(maxHeight: 120),
              decoration: BoxDecoration(color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(22)),
              child: TextField(controller: _input, maxLines: null,
                onChanged: (v) => _handleTyping(v.trim().isNotEmpty),
                style: GoogleFonts.inter(fontSize: 14.5, color: isDark ? ReonColors.textDark : ReonColors.textLight),
                decoration: InputDecoration(hintText: 'Message…', hintStyle: GoogleFonts.inter(fontSize: 14.5, color: ReonColors.textMuted),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10), border: InputBorder.none)),
            )),
            const SizedBox(width: 6),
            GestureDetector(onTap: _send, child: Container(width: 44, height: 44,
              decoration: BoxDecoration(gradient: kBrandGradient, shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 3))]),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20))),
          ]),
        ),
      ]),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  final bool isDark;
  const _TypingBubble({required this.isDark});
  @override
  Widget build(BuildContext context) => Align(alignment: Alignment.centerLeft, child: Container(
    margin: const EdgeInsets.only(left: 12, top: 2, bottom: 2, right: 64),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(color: isDark ? ReonColors.cardDark : Colors.white, borderRadius: BorderRadius.circular(18)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      for (int i = 0; i < 3; i++) ...[
        if (i > 0) const SizedBox(width: 3),
        _Dot(delay: Duration(milliseconds: i * 200)),
      ],
    ])));
}

class _Dot extends StatefulWidget {
  final Duration delay;
  const _Dot({required this.delay});
  @override State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))
      ..repeat(reverse: true, period: const Duration(milliseconds: 1200));
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => FadeTransition(opacity: _c,
    child: Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle, color: ReonColors.textMuted)));
}

class _DotGrid extends CustomPainter {
  final bool isDark;
  const _DotGrid({required this.isDark});
  @override void paint(Canvas c, Size s) {
    final p = Paint()..color = ReonColors.primary.withValues(alpha: isDark ? 0.18 : 0.07)..style = PaintingStyle.fill;
    for (double x = 0; x < s.width; x += 22) { for (double y = 0; y < s.height; y += 22) { c.drawCircle(Offset(x, y), 1, p); } }
  }
  @override bool shouldRepaint(_DotGrid o) => o.isDark != isDark;
}
