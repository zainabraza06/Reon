import 'dart:io';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import '../theme/app_theme.dart';
import '../models/message.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';
import 'message_info_sheet.dart';

class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isMine;
  final ReonUser? recipient;
  final VoidCallback? onRetry;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    this.recipient,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final timeStr = DateFormat('HH:mm').format(message.sentAt);
    final hasMedia = message.media.isNotEmpty;
    final text = message.plaintext ??
        (hasMedia ? null : message.ciphertext);

    final isUploadingMedia = !hasMedia &&
        message.contentType != 'text' &&
        message.status == 'sending';

    Widget content = Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Media content (uploaded)
        if (hasMedia) _buildMediaContent(message.media.first, isDark),
        // Upload preview (optimistic, not yet confirmed by server)
        if (isUploadingMedia)
          _buildUploadingPreview(message, isDark),
        // Text below media (or standalone)
        if (text != null && text.isNotEmpty)
          Padding(
            padding: (hasMedia || isUploadingMedia)
                ? const EdgeInsets.only(top: 6)
                : EdgeInsets.zero,
            child: Text(
              text,
              style: GoogleFonts.inter(
                fontSize: 14.5,
                height: 1.45,
                color: isMine
                    ? Colors.white
                    : (isDark ? ReonColors.textDark : ReonColors.textLight),
              ),
            ),
          ),
        // Encrypted-but-no-plaintext fallback (text messages only)
        if (!hasMedia && !isUploadingMedia && text == null && message.ciphertext != null)
          Text(
            '🔒 Encrypted',
            style: GoogleFonts.inter(
              fontSize: 13,
              fontStyle: FontStyle.italic,
              color: isMine ? Colors.white70 : ReonColors.textMuted,
            ),
          ),
        // Retry banner for failed messages
        if (message.isFailed && onRetry != null)
          GestureDetector(
            onTap: onRetry,
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.refresh_rounded,
                    size: 13, color: Colors.redAccent),
                const SizedBox(width: 3),
                Text(
                  'Tap to retry',
                  style: GoogleFonts.inter(
                      fontSize: 11, color: Colors.redAccent),
                ),
              ]),
            ),
          ),
        const SizedBox(height: 4),
        // Timestamp + status ticks
        Row(mainAxisSize: MainAxisSize.min, children: [
          Text(
            timeStr,
            style: GoogleFonts.inter(
              fontSize: 11,
              color: isMine
                  ? Colors.white.withValues(alpha: 0.6)
                  : ReonColors.textMuted,
            ),
          ),
          if (isMine) ...[
            const SizedBox(width: 3),
            _TickIcon(status: message.status),
          ],
        ]),
      ],
    );

    Widget bubble = Container(
      decoration: isMine
          ? gradientBubbleDecoration(roundBR: false)
          : BoxDecoration(
              color: isDark ? ReonColors.cardDark : Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black
                      .withValues(alpha: isDark ? 0.25 : 0.06),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                )
              ],
            ),
      // Remove padding when the bubble is purely an image (uploaded or uploading)
      padding: ((hasMedia && message.media.first.type == 'image' ||
                  (isUploadingMedia && message.contentType == 'image')) &&
              (text == null || text.isEmpty) &&
              !message.isFailed)
          ? EdgeInsets.zero
          : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: content,
    );

    if (isMine && recipient != null) {
      bubble = GestureDetector(
        onLongPress: () =>
            MessageInfoSheet.showForMessage(context, message, recipient!),
        child: bubble,
      );
    }

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          top: 2,
          bottom: 2,
          left: isMine ? 64 : 12,
          right: isMine ? 12 : 64,
        ),
        child: bubble,
      ),
    );
  }

  Widget _buildMediaContent(MediaFile media, bool isDark) {
    switch (media.type) {
      case 'image':
        return _ImageContent(media: media, isMine: isMine);
      case 'audio':
        return _AudioContent(media: media, isMine: isMine);
      case 'video':
        return _VideoContent(media: media, isMine: isMine);
      default:
        return _DocumentContent(media: media, isMine: isMine);
    }
  }

  Widget _buildUploadingPreview(ChatMessage msg, bool isDark) {
    final color = isMine ? Colors.white : ReonColors.primary;
    if (msg.contentType == 'image' && msg.localBytes != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          children: [
            SizedBox(
              width: 220,
              height: 165,
              child: Image.memory(
                msg.localBytes!,
                fit: BoxFit.cover,
                color: Colors.black38,
                colorBlendMode: BlendMode.darken,
              ),
            ),
            const Positioned.fill(
              child: Center(
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white70),
              ),
            ),
          ],
        ),
      );
    }
    // Generic uploading placeholder for audio / video / document
    final label = msg.contentType == 'audio'
        ? 'Sending voice…'
        : msg.contentType == 'video'
            ? 'Sending video…'
            : 'Sending file…';
    return SizedBox(
      width: 180,
      child: Row(children: [
        SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2, color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: isMine ? Colors.white70 : ReonColors.textMuted,
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Image ─────────────────────────────────────────────────────────────────────

class _ImageContent extends StatefulWidget {
  final MediaFile media;
  final bool isMine;
  const _ImageContent({required this.media, required this.isMine});
  @override
  State<_ImageContent> createState() => _ImageContentState();
}

class _ImageContentState extends State<_ImageContent> {
  Uint8List? _bytes;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final enc = await ApiService.instance.downloadMedia(widget.media.url);
      final key = widget.media.encryptedKey;
      final iv = widget.media.encryptionIV;
      if (key == null || iv == null) throw Exception('missing keys');
      final dec =
          await CryptoService.instance.decryptMedia(enc, key, iv);
      if (mounted) setState(() { _bytes = dec; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  void _viewFullScreen(BuildContext context) {
    if (_bytes == null) return;
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: EdgeInsets.zero,
        child: Stack(children: [
          Center(
            child: InteractiveViewer(
              child: Image.memory(_bytes!, fit: BoxFit.contain),
            ),
          ),
          Positioned(
            top: 36,
            right: 12,
            child: IconButton(
              icon: const Icon(Icons.close_rounded,
                  color: Colors.white, size: 28),
              onPressed: () => Navigator.pop(context),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: GestureDetector(
        onTap: () => _viewFullScreen(context),
        child: SizedBox(
          width: 220,
          height: 165,
          child: _loading
              ? Container(
                  color: Colors.black26,
                  child: const Center(
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white70),
                  ),
                )
              : _error || _bytes == null
                  ? Container(
                      color: Colors.black26,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.broken_image_rounded,
                              color: Colors.white54, size: 36),
                          const SizedBox(height: 4),
                          Text('Failed to load',
                              style: GoogleFonts.inter(
                                  fontSize: 11, color: Colors.white54)),
                        ],
                      ),
                    )
                  : Image.memory(_bytes!, fit: BoxFit.cover),
        ),
      ),
    );
  }
}

// ── Audio / Voice ─────────────────────────────────────────────────────────────

class _AudioContent extends StatefulWidget {
  final MediaFile media;
  final bool isMine;
  const _AudioContent({required this.media, required this.isMine});
  @override
  State<_AudioContent> createState() => _AudioContentState();
}

class _AudioContentState extends State<_AudioContent> {
  final _player = AudioPlayer();
  bool _loading = false;
  bool _playing = false;
  Duration _position = Duration.zero;
  Duration _total = Duration.zero;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _playing = s == PlayerState.playing);
    });
    _player.onPositionChanged.listen((p) {
      if (mounted) setState(() => _position = p);
    });
    _player.onDurationChanged.listen((d) {
      if (mounted) setState(() => _total = d);
    });
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() { _position = Duration.zero; _playing = false; });
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_loading) return;

    if (_ready) {
      if (_playing) {
        await _player.pause();
      } else {
        await _player.resume();
      }
      return;
    }

    setState(() => _loading = true);
    try {
      final enc = await ApiService.instance.downloadMedia(widget.media.url);
      final key = widget.media.encryptedKey;
      final iv = widget.media.encryptionIV;
      if (key == null || iv == null) throw Exception('missing keys');
      final dec = await CryptoService.instance.decryptMedia(enc, key, iv);
      if (dec == null) throw Exception('decryption failed');
      final dir = await getTemporaryDirectory();
      final file = File(
          '${dir.path}/audio_${DateTime.now().millisecondsSinceEpoch}.aac');
      await file.writeAsBytes(dec);
      await _player.play(DeviceFileSource(file.path));
      if (mounted) setState(() { _loading = false; _ready = true; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _fmt(Duration d) =>
      '${d.inMinutes.toString().padLeft(2, '0')}:'
      '${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final color = widget.isMine ? Colors.white : ReonColors.primary;
    final progress = _total.inMilliseconds > 0
        ? (_position.inMilliseconds / _total.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return SizedBox(
      width: 210,
      child: Row(children: [
        GestureDetector(
          onTap: _toggle,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: (widget.isMine ? Colors.white : ReonColors.primary)
                  .withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: _loading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: color),
                  )
                : Icon(
                    _playing
                        ? Icons.pause_rounded
                        : Icons.play_arrow_rounded,
                    color: color,
                    size: 24,
                  ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Waveform-style progress bar
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: color.withValues(alpha: 0.2),
                  color: color,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _total.inSeconds > 0 ? _fmt(_total) : '0:00',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  color: widget.isMine
                      ? Colors.white70
                      : ReonColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }
}

// ── Video ─────────────────────────────────────────────────────────────────────

class _VideoContent extends StatelessWidget {
  final MediaFile media;
  final bool isMine;
  const _VideoContent({required this.media, required this.isMine});

  @override
  Widget build(BuildContext context) {
    final color = isMine ? Colors.white : ReonColors.primary;
    return Container(
      width: 220,
      height: 140,
      decoration: BoxDecoration(
        color: Colors.black38,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.play_circle_fill_rounded, color: color, size: 48),
        const SizedBox(height: 6),
        Text(
          media.fileName ?? 'Video',
          style: GoogleFonts.inter(
              fontSize: 12, color: Colors.white70),
          overflow: TextOverflow.ellipsis,
        ),
      ]),
    );
  }
}

// ── Document ──────────────────────────────────────────────────────────────────

class _DocumentContent extends StatelessWidget {
  final MediaFile media;
  final bool isMine;
  const _DocumentContent({required this.media, required this.isMine});

  IconData _iconFor(String? name) {
    final ext = name?.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf': return Icons.picture_as_pdf_rounded;
      case 'doc':
      case 'docx': return Icons.description_rounded;
      case 'xls':
      case 'xlsx': return Icons.table_chart_rounded;
      case 'ppt':
      case 'pptx': return Icons.slideshow_rounded;
      case 'zip':
      case 'rar':
      case '7z': return Icons.folder_zip_rounded;
      default: return Icons.insert_drive_file_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = isMine ? Colors.white : ReonColors.primary;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(_iconFor(media.fileName), color: color, size: 32),
      const SizedBox(width: 8),
      Flexible(
        child: Text(
          media.fileName ?? 'Document',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: isMine ? Colors.white : ReonColors.textLight,
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ),
    ]);
  }
}

// ── Public helper — reused by GroupChatScreen ─────────────────────────────────

Widget buildMediaContentWidget(MediaFile media, bool isMine) {
  switch (media.type) {
    case 'image':   return _ImageContent(media: media, isMine: isMine);
    case 'audio':   return _AudioContent(media: media, isMine: isMine);
    case 'video':   return _VideoContent(media: media, isMine: isMine);
    default:        return _DocumentContent(media: media, isMine: isMine);
  }
}

// ── Delivery tick ─────────────────────────────────────────────────────────────

class _TickIcon extends StatelessWidget {
  final String status;
  const _TickIcon({required this.status});
  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'read':
        return Icon(Icons.done_all_rounded,
            size: 14, color: ReonColors.accent.withValues(alpha: 0.9));
      case 'delivered':
        return Icon(Icons.done_all_rounded,
            size: 14, color: Colors.white.withValues(alpha: 0.6));
      case 'sending':
        return Icon(Icons.access_time_rounded,
            size: 13, color: Colors.white.withValues(alpha: 0.5));
      case 'failed':
        return const Icon(Icons.error_outline_rounded,
            size: 14, color: Colors.redAccent);
      default:
        return Icon(Icons.done_rounded,
            size: 14, color: Colors.white.withValues(alpha: 0.55));
    }
  }
}
