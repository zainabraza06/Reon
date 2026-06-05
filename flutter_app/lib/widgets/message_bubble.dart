import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/mock_data.dart';
import 'message_info_sheet.dart';

class MessageBubble extends StatelessWidget {
  final MockMessage message;
  final bool isMine;
  /// Required when isMine is true so the info sheet can show the recipient.
  final MockUser? recipient;

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

    Widget bubble = Container(
      decoration: isMine
          ? gradientBubbleDecoration(roundBR: false)
          : BoxDecoration(
              color: isDark ? ReonColors.cardDark : Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft:     Radius.circular(4),
                topRight:    Radius.circular(18),
                bottomLeft:  Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message.text,
            style: GoogleFonts.inter(
              fontSize: 14.5,
              height: 1.45,
              color: isMine
                  ? Colors.white
                  : (isDark ? ReonColors.textDark : ReonColors.textLight),
            ),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
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
            ],
          ),
        ],
      ),
    );

    // Wrap in GestureDetector for long-press info sheet (sent messages only)
    if (isMine && recipient != null) {
      bubble = GestureDetector(
        onLongPress: () => MessageInfoSheet.show(context, message, recipient!),
        child: bubble,
      );
    }

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          top: 2, bottom: 2,
          left:  isMine ? 64 : 12,
          right: isMine ? 12 : 64,
        ),
        child: bubble,
      ),
    );
  }
}

/// Three-state tick: sent (grey ✓), delivered (grey ✓✓), read (cyan ✓✓).
class _TickIcon extends StatelessWidget {
  final String status; // "sent" | "delivered" | "read"
  const _TickIcon({required this.status});

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'read':
        return Icon(Icons.done_all_rounded, size: 14,
            color: ReonColors.accent.withValues(alpha: 0.9));
      case 'delivered':
        return Icon(Icons.done_all_rounded, size: 14,
            color: Colors.white.withValues(alpha: 0.6));
      default: // sent
        return Icon(Icons.done_rounded, size: 14,
            color: Colors.white.withValues(alpha: 0.55));
    }
  }
}
