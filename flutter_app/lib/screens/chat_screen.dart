import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../models/mock_data.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends StatefulWidget {
  final MockChat chat;
  const ChatScreen({super.key, required this.chat});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input  = TextEditingController();
  final _scroll = ScrollController();
  late List<MockMessage> _messages;
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _messages = List.of(conversationWith(widget.chat.user.id));
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add(MockMessage(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        senderId: 'me',
        text: text,
        sentAt: DateTime.now(),
        isRead: false,
      ));
      _input.clear();
      _hasText = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user   = widget.chat.user;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF080816) : const Color(0xFFEEF2FF),
      appBar: AppBar(
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new, size: 18, color: isDark ? Colors.white : ReonColors.textLight),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(children: [
          ChatAvatar(name: user.name, size: 38, isOnline: user.isOnline),
          const SizedBox(width: 10),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(user.name, style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white : ReonColors.textLight)),
              Text(user.isOnline ? 'Online' : 'Last seen recently',
                style: GoogleFonts.inter(fontSize: 12, color: user.isOnline ? ReonColors.online : ReonColors.textMuted)),
            ],
          )),
        ]),
        actions: [
          IconButton(
            icon: Icon(Icons.phone_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
            onPressed: () {},
            tooltip: 'Voice call',
          ),
          IconButton(
            icon: Icon(Icons.videocam_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
            onPressed: () {},
            tooltip: 'Video call',
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Message list ────────────────────────────────────
          Expanded(
            child: _ChatBackground(
              isDark: isDark,
              child: ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.symmetric(vertical: 10),
                itemCount: _messages.length,
                itemBuilder: (_, i) => MessageBubble(
                  message: _messages[i],
                  isMine: _messages[i].senderId == 'me',
                ),
              ),
            ),
          ),

          // ── Input bar ────────────────────────────────────────
          Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: EdgeInsets.only(
              left: 8, right: 8,
              top: 8,
              bottom: MediaQuery.of(context).padding.bottom + 8,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  icon: Icon(Icons.attach_file_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
                  onPressed: () {},
                  tooltip: 'Attach file',
                ),

                Expanded(
                  child: Container(
                    constraints: const BoxConstraints(maxHeight: 120),
                    decoration: BoxDecoration(
                      color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: isDark ? ReonColors.borderDark : Colors.transparent),
                    ),
                    child: TextField(
                      controller: _input,
                      maxLines: null,
                      onChanged: (v) => setState(() => _hasText = v.trim().isNotEmpty),
                      style: GoogleFonts.inter(fontSize: 14.5, color: isDark ? ReonColors.textDark : ReonColors.textLight),
                      decoration: InputDecoration(
                        hintText: 'Message…',
                        hintStyle: GoogleFonts.inter(fontSize: 14.5, color: ReonColors.textMuted),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 6),

                // Send / mic button
                GestureDetector(
                  onTap: _hasText ? _send : null,
                  child: Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      gradient: _hasText ? kBrandGradient : null,
                      color: _hasText ? null : (isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6)),
                      shape: BoxShape.circle,
                      boxShadow: _hasText ? [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 3))] : null,
                    ),
                    child: Icon(
                      _hasText ? Icons.send_rounded : Icons.mic_none_outlined,
                      color: _hasText ? Colors.white : (isDark ? ReonColors.textMuted : Colors.grey.shade500),
                      size: 20,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Dot-grid chat background ──────────────────────────────────────────────────
class _ChatBackground extends StatelessWidget {
  final bool isDark;
  final Widget child;
  const _ChatBackground({required this.isDark, required this.child});

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _DotGridPainter(isDark: isDark),
    child: child,
  );
}

class _DotGridPainter extends CustomPainter {
  final bool isDark;
  const _DotGridPainter({required this.isDark});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = (isDark ? ReonColors.primary : ReonColors.primary).withValues(alpha: isDark ? 0.18 : 0.07)
      ..style = PaintingStyle.fill;
    const spacing = 22.0;
    for (double x = 0; x < size.width; x += spacing) {
      for (double y = 0; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DotGridPainter old) => old.isDark != isDark;
}
