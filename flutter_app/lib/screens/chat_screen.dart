import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final myId = context.read<AuthProvider>().user!.id;

    return ChangeNotifierProvider(
      create: (_) => ChatProvider(
        recipientId: userId,
        recipientName: userName,
        recipientAvatar: userAvatar,
      )..init(myId),
      child: const _ChatView(),
    );
  }
}

class _ChatView extends StatefulWidget {
  const _ChatView();
  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send(ChatProvider chat, String myId) async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    chat.handleTyping(false, myId);
    await chat.sendMessage(text, myId);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final me = context.watch<AuthProvider>().user!;
    final chat = context.watch<ChatProvider>();

    // Auto-scroll when messages are added
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients &&
          _scroll.position.maxScrollExtent - _scroll.position.pixels < 200) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF080816) : const Color(0xFFEEF2FF),
      appBar: AppBar(
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new,
              size: 18, color: isDark ? Colors.white : ReonColors.textLight),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(children: [
          ChatAvatar(
            name: chat.recipientName,
            imageUrl: chat.recipientAvatar,
            size: 38,
            isOnline: chat.isOnline,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  chat.recipientName,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : ReonColors.textLight,
                  ),
                ),
                Text(
                  chat.isTyping ? 'typing…' : (chat.isOnline ? 'Online' : ''),
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color:
                        chat.isTyping ? ReonColors.primary : ReonColors.online,
                  ),
                ),
              ],
            ),
          ),
        ]),
      ),
      body: Column(children: [
        if (chat.hasMore && !chat.loading)
          GestureDetector(
            onTap: () {
              if (chat.messages.isNotEmpty) {
                chat.loadMessages(me.id,
                    before: chat.messages.first.sentAt.toIso8601String());
              }
            },
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Load earlier',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: ReonColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        Expanded(
          child: chat.loading && chat.messages.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : CustomPaint(
                  painter: _DotGrid(isDark: isDark),
                  child: ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    itemCount: chat.messages.length + (chat.isTyping ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (chat.isTyping && i == chat.messages.length) {
                        return _TypingBubble(isDark: isDark);
                      }
                      final msg = chat.messages[i];
                      return MessageBubble(
                        message: msg,
                        isMine: msg.sender == me.id,
                        recipient: chat.recipient,
                      );
                    },
                  ),
                ),
        ),
        Container(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          padding: EdgeInsets.only(
            left: 8,
            right: 8,
            top: 8,
            bottom: MediaQuery.of(context).padding.bottom + 8,
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: Container(
                constraints: const BoxConstraints(maxHeight: 120),
                decoration: BoxDecoration(
                  color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: TextField(
                  controller: _input,
                  maxLines: null,
                  onChanged: (v) =>
                      chat.handleTyping(v.trim().isNotEmpty, me.id),
                  style: GoogleFonts.inter(
                    fontSize: 14.5,
                    color: isDark ? ReonColors.textDark : ReonColors.textLight,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Message…',
                    hintStyle: GoogleFonts.inter(
                        fontSize: 14.5, color: ReonColors.textMuted),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
            GestureDetector(
              onTap: () => _send(chat, me.id),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: kBrandGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: ReonColors.primary.withValues(alpha: 0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: const Icon(Icons.send_rounded,
                    color: Colors.white, size: 20),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

// ── Private widgets ───────────────────────────────────────────────────────────

class _TypingBubble extends StatelessWidget {
  final bool isDark;
  const _TypingBubble({required this.isDark});
  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(left: 12, top: 2, bottom: 2, right: 64),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? ReonColors.cardDark : Colors.white,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            for (int i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: 3),
              _Dot(delay: Duration(milliseconds: i * 200)),
            ],
          ]),
        ),
      );
}

class _Dot extends StatefulWidget {
  final Duration delay;
  const _Dot({required this.delay});
  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true, period: const Duration(milliseconds: 1200));
    Future.delayed(widget.delay, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _c,
        child: Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
              shape: BoxShape.circle, color: ReonColors.textMuted),
        ),
      );
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
