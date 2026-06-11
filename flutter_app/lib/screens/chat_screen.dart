import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/message_bubble.dart';

// 50 common emoji stickers
const _stickers = [
  '😀', '😂', '😍', '🥰', '😊', '😎', '🤔', '😭', '😡', '🥺',
  '👍', '👎', '❤️', '💯', '🔥', '✨', '🎉', '👀', '💪', '🙏',
  '😅', '😆', '🤩', '🥳', '😴', '🤒', '🤗', '😏', '🫠', '🫡',
  '🐶', '🐱', '🦁', '🐼', '🦊', '🐸', '🌸', '🌟', '⭐', '💎',
  '🍕', '🍔', '🍣', '🍦', '🎂', '🍩', '☕', '🎮', '🎵', '🏆',
];

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

String _formatLastSeen(DateTime dt) {
  final now = DateTime.now();
  final diff = now.difference(dt);
  if (diff.inMinutes < 1) return 'last seen just now';
  if (diff.inMinutes < 60) return 'last seen ${diff.inMinutes}m ago';
  if (diff.inHours < 24) return 'last seen ${diff.inHours}h ago';
  final yesterday = DateTime(now.year, now.month, now.day - 1);
  if (dt.year == yesterday.year &&
      dt.month == yesterday.month &&
      dt.day == yesterday.day) {
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return 'last seen yesterday at $hh:$mm';
  }
  return 'last seen ${dt.day} ${_monthAbbr(dt.month)}';
}

String _monthAbbr(int m) => const [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ][m];

class _ChatView extends StatefulWidget {
  const _ChatView();
  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _imagePicker = ImagePicker();
  final _audioRecorder = AudioRecorder();

  bool _showEmojiPanel = false;
  bool _recording = false;
  bool _initialScrollDone = false;
  Duration _recordDuration = Duration.zero;
  Timer? _recordTimer;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    _recordTimer?.cancel();
    _audioRecorder.dispose();
    super.dispose();
  }

  Widget _buildStatusSubtitle(ChatProvider chat, bool isDark) {
    final privacy = chat.recipient?.privacySettings;
    final showActive = privacy?.showActiveStatus ?? true;
    final showLastSeen = privacy?.showLastSeen ?? true;

    if (chat.isTyping) {
      return Text('typing…',
          style: GoogleFonts.inter(fontSize: 12, color: ReonColors.primary));
    }
    if (chat.isOnline && showActive) {
      return Text('Online',
          style: GoogleFonts.inter(fontSize: 12, color: ReonColors.online));
    }
    if (!chat.isOnline && chat.lastSeen != null && showLastSeen) {
      return Text(_formatLastSeen(chat.lastSeen!),
          style: GoogleFonts.inter(
              fontSize: 12, color: ReonColors.textMuted));
    }
    return const SizedBox.shrink();
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
    setState(() {});
    chat.handleTyping(false, myId);
    // onOptimisticAdded fires after the temp bubble is added but before the
    // HTTP request, so the user sees the message immediately without waiting
    // for the network round trip.
    await chat.sendMessage(text, myId, onOptimisticAdded: _scrollToBottom);
    _scrollToBottom();
  }

  Future<void> _startRecording() async {
    if (!await _audioRecorder.hasPermission()) return;
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.aac';
    await _audioRecorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1),
      path: path,
    );
    setState(() {
      _recording = true;
      _recordDuration = Duration.zero;
    });
    _recordTimer =
        Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordDuration += const Duration(seconds: 1));
    });
  }

  Future<void> _stopAndSendVoice(ChatProvider chat, String myId) async {
    _recordTimer?.cancel();
    final path = await _audioRecorder.stop();
    setState(() => _recording = false);
    if (path == null) return;
    final bytes = await File(path).readAsBytes();
    await chat.sendMediaMessage(bytes, 'audio', myId,
        fileName: 'voice.aac', isVoiceMessage: true);
    _scrollToBottom();
  }

  Future<void> _cancelRecording() async {
    _recordTimer?.cancel();
    await _audioRecorder.stop();
    if (mounted) setState(() {
      _recording = false;
      _recordDuration = Duration.zero;
    });
  }

  Future<void> _showAttachmentSheet(ChatProvider chat, String myId) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _AttachOption(
                icon: Icons.camera_alt_rounded,
                label: 'Camera',
                color: Colors.blue,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickImage(
                      source: ImageSource.camera, imageQuality: 80);
                  if (f != null && mounted) {
                    await chat.sendMediaMessage(
                        await f.readAsBytes(), 'image', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.photo_library_rounded,
                label: 'Gallery',
                color: Colors.purple,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickImage(
                      source: ImageSource.gallery, imageQuality: 80);
                  if (f != null && mounted) {
                    await chat.sendMediaMessage(
                        await f.readAsBytes(), 'image', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.videocam_rounded,
                label: 'Video',
                color: Colors.red,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickVideo(
                      source: ImageSource.gallery);
                  if (f != null && mounted) {
                    await chat.sendMediaMessage(
                        await f.readAsBytes(), 'video', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.insert_drive_file_rounded,
                label: 'Document',
                color: Colors.orange,
                onTap: () async {
                  Navigator.pop(ctx);
                  final result =
                      await FilePicker.platform.pickFiles(withData: true);
                  if (result != null &&
                      result.files.isNotEmpty &&
                      mounted) {
                    final file = result.files.first;
                    if (file.bytes != null) {
                      await chat.sendMediaMessage(
                          file.bytes!, 'document', myId,
                          fileName: file.name);
                      _scrollToBottom();
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDuration(Duration d) =>
      '${d.inMinutes.toString().padLeft(2, '0')}:'
      '${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final me = context.watch<AuthProvider>().user!;
    final chat = context.watch<ChatProvider>();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      // Jump to the bottom once when messages first load so newest is visible.
      if (!_initialScrollDone && !chat.loading && chat.messages.isNotEmpty) {
        _initialScrollDone = true;
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
        return;
      }
      if (_scroll.position.hasContentDimensions &&
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
              size: 18,
              color: isDark ? Colors.white : ReonColors.textLight),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(children: [
          ChatAvatar(
            name: chat.recipientName,
            imageUrl: chat.recipientAvatar,
            size: 38,
            isOnline: chat.isOnline &&
                (chat.recipient?.privacySettings.showActiveStatus ?? true),
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
                      color: isDark ? Colors.white : ReonColors.textLight),
                ),
                _buildStatusSubtitle(chat, isDark),
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
              child: Text('Load earlier',
                  style: GoogleFonts.inter(
                      fontSize: 12,
                      color: ReonColors.primary,
                      fontWeight: FontWeight.w600)),
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
                    itemCount:
                        chat.messages.length + (chat.isTyping ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (chat.isTyping && i == chat.messages.length) {
                        return _TypingBubble(isDark: isDark);
                      }
                      final msg = chat.messages[i];
                      return MessageBubble(
                        message: msg,
                        isMine: msg.sender == me.id,
                        recipient: chat.recipient,
                        onRetry: msg.isFailed
                            ? () => chat.retryFailed(msg, me.id)
                            : null,
                      );
                    },
                  ),
                ),
        ),
        // Upload progress indicator
        if (chat.uploading)
          LinearProgressIndicator(
              backgroundColor: ReonColors.primary.withValues(alpha: 0.1),
              color: ReonColors.primary),
        // Emoji sticker panel
        if (_showEmojiPanel) _EmojiPanel(
          isDark: isDark,
          onEmoji: (emoji) {
            final pos = _input.selection;
            final text = _input.text;
            if (pos.isValid && pos.start >= 0) {
              final start = pos.start.clamp(0, text.length);
              final end = pos.end.clamp(0, text.length);
              _input.text = text.replaceRange(start, end, emoji);
              _input.selection = TextSelection.collapsed(
                  offset: start + emoji.length);
            } else {
              _input.text = text + emoji;
            }
            setState(() {});
          },
        ),
        // Input bar (or "can't chat" notice when no longer friends)
        if (!chat.isFriend)
          _NotFriendBar(isDark: isDark)
        else
          _buildInputBar(chat, me.id, isDark),
      ]),
    );
  }

  Widget _buildInputBar(ChatProvider chat, String myId, bool isDark) {
    if (_recording) {
      return Container(
        color: isDark ? ReonColors.surfaceDark : Colors.white,
        padding: EdgeInsets.only(
          left: 12,
          right: 12,
          top: 8,
          bottom: MediaQuery.of(context).padding.bottom + 8,
        ),
        child: Row(children: [
          IconButton(
            icon: const Icon(Icons.close_rounded, color: Colors.red),
            onPressed: _cancelRecording,
            tooltip: 'Cancel',
          ),
          Container(
            width: 8,
            height: 8,
            decoration:
                const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Recording  ${_formatDuration(_recordDuration)}',
              style: GoogleFonts.inter(
                  fontSize: 14,
                  color: isDark ? ReonColors.textDark : ReonColors.textLight),
            ),
          ),
          GestureDetector(
            onTap: () => _stopAndSendVoice(chat, myId),
            child: _ActionButton(icon: Icons.send_rounded),
          ),
        ]),
      );
    }

    return Container(
      color: isDark ? ReonColors.surfaceDark : Colors.white,
      padding: EdgeInsets.only(
        left: 4,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        // Emoji / keyboard toggle
        IconButton(
          icon: Icon(
            _showEmojiPanel
                ? Icons.keyboard_rounded
                : Icons.emoji_emotions_outlined,
            color: isDark ? ReonColors.textMuted : Colors.grey.shade500,
            size: 22,
          ),
          onPressed: () {
            setState(() => _showEmojiPanel = !_showEmojiPanel);
            if (_showEmojiPanel) FocusScope.of(context).unfocus();
          },
        ),
        // Attachment button (only when no text typed)
        if (_input.text.trim().isEmpty)
          IconButton(
            icon: Icon(Icons.attach_file_rounded,
                color: isDark ? ReonColors.textMuted : Colors.grey.shade500,
                size: 22),
            onPressed: () => _showAttachmentSheet(chat, myId),
          ),
        // Text field
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
              onChanged: (v) {
                chat.handleTyping(v.trim().isNotEmpty, myId);
                setState(() {});
              },
              onTap: () {
                if (_showEmojiPanel) setState(() => _showEmojiPanel = false);
              },
              style: GoogleFonts.inter(
                  fontSize: 14.5,
                  color:
                      isDark ? ReonColors.textDark : ReonColors.textLight),
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
        // Send (text present) or Mic (empty)
        if (_input.text.trim().isNotEmpty)
          GestureDetector(
            onTap: () => _send(chat, myId),
            child: _ActionButton(icon: Icons.send_rounded),
          )
        else
          GestureDetector(
            onTap: _startRecording,
            child: _ActionButton(icon: Icons.mic_rounded),
          ),
      ]),
    );
  }
}

// ── Shared action button ──────────────────────────────────────────────────────

class _ActionButton extends StatelessWidget {
  final IconData icon;
  const _ActionButton({required this.icon});
  @override
  Widget build(BuildContext context) => Container(
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
        child: Icon(icon, color: Colors.white, size: 20),
      );
}

// ── Emoji / sticker panel ─────────────────────────────────────────────────────

class _EmojiPanel extends StatelessWidget {
  final bool isDark;
  final void Function(String) onEmoji;
  const _EmojiPanel({required this.isDark, required this.onEmoji});

  @override
  Widget build(BuildContext context) => Container(
        height: 200,
        color: isDark ? ReonColors.surfaceDark : Colors.white,
        child: GridView.builder(
          padding: const EdgeInsets.all(8),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 10,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
          ),
          itemCount: _stickers.length,
          itemBuilder: (_, i) => GestureDetector(
            onTap: () => onEmoji(_stickers[i]),
            child: Center(
              child: Text(_stickers[i],
                  style: const TextStyle(fontSize: 22)),
            ),
          ),
        ),
      );
}

// ── Attachment bottom-sheet option ────────────────────────────────────────────

class _AttachOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _AttachOption(
      {required this.icon,
      required this.label,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 26),
        ),
        const SizedBox(height: 6),
        Text(label,
            style: GoogleFonts.inter(
                fontSize: 12,
                color: isDark ? ReonColors.textMuted : Colors.grey.shade700)),
      ]),
    );
  }
}

// ── Typing bubble ─────────────────────────────────────────────────────────────

class _TypingBubble extends StatelessWidget {
  final bool isDark;
  const _TypingBubble({required this.isDark});
  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin:
              const EdgeInsets.only(left: 12, top: 2, bottom: 2, right: 64),
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
          decoration: const BoxDecoration(
              shape: BoxShape.circle, color: ReonColors.textMuted),
        ),
      );
}

// ── "No longer friends" input replacement ────────────────────────────────────

class _NotFriendBar extends StatelessWidget {
  final bool isDark;
  const _NotFriendBar({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isDark ? ReonColors.surfaceDark : Colors.white,
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.person_remove_outlined,
              size: 18,
              color: isDark ? Colors.grey.shade500 : Colors.grey.shade500),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              'You\'re no longer friends. Messaging is unavailable.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: isDark ? Colors.grey.shade500 : Colors.grey.shade600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Background dot grid ───────────────────────────────────────────────────────

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
