import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/mock_data.dart';
import '../widgets/chat_avatar.dart';
import 'chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab;
  final _search = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    _search.dispose();
    super.dispose();
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    if (dt.toDateString() == now.toDateString()) return DateFormat('HH:mm').format(dt);
    if (now.difference(dt).inDays < 7) return DateFormat('EEE').format(dt);
    return DateFormat('dd/MM').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filtered = kChats.where((c) =>
      _query.isEmpty || c.user.name.toLowerCase().contains(_query.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: Column(
        children: [
          // ── Top bar ──────────────────────────────────────────
          Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 8,
              left: 16, right: 16, bottom: 12,
            ),
            child: Row(children: [
              // Brand gradient text
              ShaderMask(
                shaderCallback: (b) => kBrandGradient.createShader(b),
                child: Text('Reon', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
              ),
              const Spacer(),
              IconButton(
                icon: Icon(Icons.explore_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
                onPressed: () {},
                tooltip: 'Discover',
              ),
              IconButton(
                icon: Icon(Icons.group_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
                onPressed: () {},
                tooltip: 'Friends',
              ),
              IconButton(
                icon: Icon(Icons.settings_outlined, color: isDark ? ReonColors.textMuted : Colors.grey.shade500),
                onPressed: () {},
                tooltip: 'Settings',
              ),
            ]),
          ),

          // ── Search ───────────────────────────────────────────
          Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: TextField(
              controller: _search,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Search or start new chat',
                hintStyle: GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted),
                prefixIcon: Icon(Icons.search, size: 18, color: ReonColors.textMuted),
                filled: true,
                fillColor: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: ReonColors.primary, width: 1.5),
                ),
              ),
            ),
          ),

          // ── Tabs ─────────────────────────────────────────────
          Container(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Container(
              height: 36,
              decoration: BoxDecoration(
                color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(10),
              ),
              child: TabBar(
                controller: _tab,
                labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                unselectedLabelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500),
                labelColor: Colors.white,
                unselectedLabelColor: ReonColors.textMuted,
                indicator: BoxDecoration(
                  gradient: kBrandGradient,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.3), blurRadius: 6)],
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                tabs: const [Tab(text: 'Chats'), Tab(text: 'Groups')],
              ),
            ),
          ),

          // ── List ─────────────────────────────────────────────
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                // Chats tab
                filtered.isEmpty
                    ? _empty('No conversations yet')
                    : ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (_, i) => _ChatTile(
                          chat: filtered[i],
                          timeStr: _formatTime(filtered[i].lastTime),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => ChatScreen(chat: filtered[i]))),
                        ),
                      ),
                // Groups tab (demo empty state)
                _empty('No groups yet — create one!'),
              ],
            ),
          ),
        ],
      ),

      // ── FAB ───────────────────────────────────────────────────
      floatingActionButton: Container(
        height: 52, width: 52,
        decoration: BoxDecoration(gradient: kBrandGradient, shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 4))]),
        child: IconButton(
          icon: const Icon(Icons.edit_outlined, color: Colors.white, size: 22),
          onPressed: () {},
          tooltip: 'New chat',
        ),
      ),
    );
  }

  Widget _empty(String msg) => Center(child: Text(msg, style: GoogleFonts.inter(color: ReonColors.textMuted, fontSize: 14)));
}

class _ChatTile extends StatelessWidget {
  final MockChat chat;
  final String timeStr;
  final VoidCallback onTap;
  const _ChatTile({required this.chat, required this.timeStr, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: isDark ? ReonColors.borderDark.withValues(alpha: 0.4) : const Color(0xFFF0F0F0))),
        ),
        child: Row(children: [
          ChatAvatar(name: chat.user.name, size: 50, isOnline: chat.user.isOnline),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(child: Text(chat.user.name,
                  style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14.5,
                    color: isDark ? ReonColors.textDark : ReonColors.textLight), overflow: TextOverflow.ellipsis)),
                Text(timeStr, style: GoogleFonts.inter(fontSize: 11.5, color: chat.unread > 0 ? ReonColors.primary : ReonColors.textMuted)),
              ]),
              const SizedBox(height: 3),
              Row(children: [
                Expanded(child: Text(chat.lastMessage ?? 'No messages yet',
                  style: GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted,
                    fontWeight: chat.unread > 0 ? FontWeight.w500 : FontWeight.w400),
                  overflow: TextOverflow.ellipsis, maxLines: 1)),
                if (chat.unread > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    height: 20, constraints: const BoxConstraints(minWidth: 20),
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(99),
                      boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.3), blurRadius: 6)]),
                    child: Center(child: Text('${chat.unread}',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700))),
                  ),
                ],
              ]),
            ],
          )),
        ]),
      ),
    );
  }
}

extension on DateTime {
  String get toDateString => '$year-$month-$day';
}
