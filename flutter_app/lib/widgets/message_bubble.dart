import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/message.dart';
import '../models/user.dart';
import 'message_info_sheet.dart';

class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isMine;
  final ReonUser? recipient; // needed for info sheet

  const MessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    this.recipient,
  });

  @override
  Widget build(BuildContext context) {
    final isDark  = Theme.of(context).brightness == Brightness.dark;
    final timeStr = DateFormat('HH:mm').format(message.sentAt);
    final text    = message.plaintext ?? (message.media.isEmpty ? message.ciphertext : null);

    Widget bubble = Container(
      decoration: isMine
          ? gradientBubbleDecoration(roundBR: false)
          : BoxDecoration(
              color: isDark ? ReonColors.cardDark : Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4), topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18), bottomRight: Radius.circular(18),
              ),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06), blurRadius: 6, offset: const Offset(0, 2))],
            ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
        if (text != null)
          Text(text, style: GoogleFonts.inter(fontSize: 14.5, height: 1.45,
              color: isMine ? Colors.white : (isDark ? ReonColors.textDark : ReonColors.textLight))),
        if (message.media.isNotEmpty)
          Text('[${message.media[0].type}]', style: GoogleFonts.inter(fontSize: 13, fontStyle: FontStyle.italic,
              color: isMine ? Colors.white70 : ReonColors.textMuted)),
        if (text == null && message.media.isEmpty && message.ciphertext != null)
          Text('🔒 Encrypted', style: GoogleFonts.inter(fontSize: 13, fontStyle: FontStyle.italic,
              color: isMine ? Colors.white70 : ReonColors.textMuted)),
        const SizedBox(height: 4),
        Row(mainAxisSize: MainAxisSize.min, children: [
          Text(timeStr, style: GoogleFonts.inter(fontSize: 11,
              color: isMine ? Colors.white.withValues(alpha: 0.6) : ReonColors.textMuted)),
          if (isMine) ...[const SizedBox(width: 3), _TickIcon(status: message.status)],
        ]),
      ]),
    );

    if (isMine && recipient != null) {
      bubble = GestureDetector(
        onLongPress: () => MessageInfoSheet.showForMessage(context, message, recipient!),
        child: bubble,
      );
    }

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(top: 2, bottom: 2, left: isMine ? 64 : 12, right: isMine ? 12 : 64),
        child: bubble,
      ),
    );
  }
}

class _TickIcon extends StatelessWidget {
  final String status;
  const _TickIcon({required this.status});
  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'read':
        return Icon(Icons.done_all_rounded, size: 14, color: ReonColors.accent.withValues(alpha: 0.9));
      case 'delivered':
        return Icon(Icons.done_all_rounded, size: 14, color: Colors.white.withValues(alpha: 0.6));
      case 'sending':
        return Icon(Icons.access_time_rounded, size: 13, color: Colors.white.withValues(alpha: 0.5));
      case 'failed':
        return const Icon(Icons.error_outline_rounded, size: 14, color: Colors.redAccent);
      default: // sent
        return Icon(Icons.done_rounded, size: 14, color: Colors.white.withValues(alpha: 0.55));
    }
  }
}
