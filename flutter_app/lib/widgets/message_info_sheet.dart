import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../models/message.dart';
import '../models/user.dart';
import '../theme/app_theme.dart';
import 'chat_avatar.dart';

class MessageInfoSheet extends StatelessWidget {
  final ChatMessage message;
  final ReonUser recipient;

  const MessageInfoSheet(
      {super.key, required this.message, required this.recipient});

  static void showForMessage(
      BuildContext context, ChatMessage message, ReonUser recipient) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => MessageInfoSheet(message: message, recipient: recipient),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF12122E) : Colors.white;

    return Container(
      decoration: BoxDecoration(
          color: bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20))),
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Handle
        Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
                color: isDark ? Colors.white24 : Colors.black12,
                borderRadius: BorderRadius.circular(2))),
        // Header
        Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(children: [
              Text('Message Info',
                  style: GoogleFonts.inter(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : ReonColors.textLight)),
              const Spacer(),
              IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(Icons.close_rounded,
                      size: 20,
                      color:
                          isDark ? ReonColors.textMuted : Colors.grey.shade500),
                  padding: EdgeInsets.zero,
                  constraints:
                      const BoxConstraints(minWidth: 32, minHeight: 32)),
            ])),
        Divider(
            height: 1, color: isDark ? Colors.white10 : Colors.grey.shade100),
        const SizedBox(height: 8),
        _Row(
            icon: Icons.access_time_rounded,
            iconColor: Colors.grey,
            label: 'Sent',
            timestamp: message.sentAt,
            isDark: isDark),
        _Row(
            icon: Icons.done_all_rounded,
            iconColor: Colors.grey,
            label: 'Delivered',
            timestamp: message.deliveredAt,
            recipient: message.delivered ? recipient : null,
            notYet: 'Not delivered yet',
            isDark: isDark),
        _Row(
            icon: Icons.done_all_rounded,
            iconColor: ReonColors.accent,
            label: 'Read',
            timestamp: message.readAt,
            recipient: message.read ? recipient : null,
            notYet: 'Not read yet',
            isDark: isDark),
        const SizedBox(height: 8),
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final DateTime? timestamp;
  final ReonUser? recipient;
  final String notYet;
  final bool isDark;

  const _Row(
      {required this.icon,
      required this.iconColor,
      required this.label,
      required this.timestamp,
      required this.isDark,
      this.recipient,
      this.notYet = ''});

  String _fmt(DateTime dt) =>
      '${DateFormat('MMM d').format(dt)} at ${DateFormat('HH:mm').format(dt)}';

  @override
  Widget build(BuildContext context) {
    final hasData = timestamp != null;
    return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(children: [
          Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  shape: BoxShape.circle),
              child: Icon(icon, size: 18, color: iconColor)),
          const SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                Text(label,
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : ReonColors.textLight)),
                const SizedBox(height: 2),
                Text(hasData ? _fmt(timestamp!) : notYet,
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: hasData
                            ? ReonColors.textMuted
                            : Colors.grey.shade400)),
              ])),
          if (recipient != null) ...[
            const SizedBox(width: 10),
            ChatAvatar(
                name: recipient!.fullName,
                imageUrl: recipient!.profilePic,
                size: 32)
          ],
        ]));
  }
}
