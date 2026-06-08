import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../models/recommended_user.dart';
import '../models/friend_request.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../widgets/chat_avatar.dart';

class RecommendationsScreen extends StatefulWidget {
  const RecommendationsScreen({super.key});
  @override
  State<RecommendationsScreen> createState() => _RecommendationsScreenState();
}

class _RecommendationsScreenState extends State<RecommendationsScreen> {
  final _search = TextEditingController();
  final _pending = <String>{};
  Timer? _debounce;

  List<RecommendedUser> _users = [];
  List<FriendRequest> _sent = [];
  int _total = 0;
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _search.addListener(_onSearchChanged);
    _load(page: 1, replace: true);
    _listenSocket();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    final s = SocketService.instance;
    s.off('friend-request-accepted', _onAccepted);
    s.off('friend-request-accepted-realtime', _onAccepted);
    s.off('friend-request-rejected', _onRejected);
    s.off('friend-request-withdrawn', _onWithdrawn);
    super.dispose();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() {
        _query = _search.text.trim();
        _page = 1;
      });
      _load(page: 1, replace: true);
    });
  }

  void _listenSocket() {
    final s = SocketService.instance;
    s.on('friend-request-accepted', _onAccepted);
    s.on('friend-request-accepted-realtime', _onAccepted);
    s.on('friend-request-rejected', _onRejected);
    s.on('friend-request-withdrawn', _onWithdrawn);
  }

  void _onAccepted(dynamic d) {
    final m = d as Map?;
    final id = m?['receiverId'] as String?;
    if (id != null && mounted) {
      setState(() => _users.removeWhere((u) => u.id == id));
    }
  }

  void _onRejected(dynamic d) {
    final m = d as Map?;
    final reqId = m?['requestId'] as String?;
    if (reqId == null) return;
    if (!mounted) return;
    setState(() {
      _sent.removeWhere((r) => r.id == reqId);
      _users = _users.map((u) {
        final sent = _sent.any((r) => r.receiver.id == u.id);
        return sent ? u : u.copyWithFlags(friendRequestSent: false);
      }).toList();
    });
  }

  void _onWithdrawn(dynamic d) {
    final m = d as Map?;
    final receiverId = m?['receiverId'] as String?;
    if (receiverId != null && mounted) {
      setState(() => _users = _users
          .map((u) => u.id == receiverId
              ? u.copyWithFlags(friendRequestSent: false)
              : u)
          .toList());
    }
  }

  Future<void> _load({required int page, required bool replace}) async {
    if (page == 1) {
      setState(() => _loading = true);
    } else {
      setState(() => _loadingMore = true);
    }
    try {
      final results = await Future.wait([
        ApiService.instance.getRecommendations(search: _query, page: page),
        if (page == 1)
          ApiService.instance.getSentRequests()
        else
          Future.value(<FriendRequest>[]),
      ]);
      final rec = results[0] as ({List<RecommendedUser> users, int total});
      if (mounted) {
        setState(() {
          _users = replace ? rec.users : [..._users, ...rec.users];
          _total = rec.total;
          _page = page;
          if (page == 1) {
            _sent = results[1] as List<FriendRequest>;
          }
          _loading = false;
          _loadingMore = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _sendRequest(String userId) async {
    setState(() => _pending.add(userId));
    try {
      await ApiService.instance.sendFriendRequest(userId);
      if (mounted) {
        setState(() => _users = _users
            .map((u) =>
                u.id == userId ? u.copyWithFlags(friendRequestSent: true) : u)
            .toList());
      }
    } catch (_) {}
    if (mounted) {
      setState(() => _pending.remove(userId));
    }
  }

  Future<void> _withdraw(String userId) async {
    FriendRequest? req;
    for (final r in _sent) {
      if (r.receiver.id == userId) {
        req = r;
        break;
      }
    }
    if (req == null) return;
    await ApiService.instance.withdrawFriendRequest(req.id).catchError((_) {});
    if (mounted) {
      setState(() => _users = _users
          .map((u) =>
              u.id == userId ? u.copyWithFlags(friendRequestSent: false) : u)
          .toList());
    }
    _load(page: 1, replace: true);
  }

  Future<void> _accept(String userId) async {
    try {
      final received = await ApiService.instance.getReceivedRequests();
      FriendRequest? req;
      for (final r in received) {
        if (r.sender.id == userId) {
          req = r;
          break;
        }
      }
      if (req == null) return;
      await ApiService.instance.acceptFriendRequest(req.id);
      if (mounted) setState(() => _users.removeWhere((u) => u.id == userId));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hasMore = _users.length < _total;

    return Column(
      children: [
        Container(
          padding: EdgeInsets.fromLTRB(
              16, MediaQuery.of(context).padding.top + 8, 16, 12),
          decoration: BoxDecoration(
            color: isDark ? ReonColors.surfaceDark : Colors.white,
            border: Border(
                bottom: BorderSide(
                    color: isDark
                        ? ReonColors.borderDark
                        : ReonColors.borderLight)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                      color: ReonColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.explore_rounded,
                      color: ReonColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Discover People',
                      style: GoogleFonts.inter(
                          fontWeight: FontWeight.w700, fontSize: 17)),
                  Text(
                    _total > 0
                        ? '$_total people to connect with'
                        : 'Find new people to connect with',
                    style: GoogleFonts.inter(
                        fontSize: 12, color: ReonColors.textMuted),
                  ),
                ]),
              ]),
              const SizedBox(height: 12),
              TextField(
                controller: _search,
                decoration: const InputDecoration(
                  hintText: 'Search by name or username…',
                  prefixIcon: Icon(Icons.search_rounded, size: 20),
                  isDense: true,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(
                  child: CircularProgressIndicator(color: ReonColors.primary))
              : _users.isEmpty
                  ? Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.person_add_outlined,
                          size: 48,
                          color: ReonColors.textMuted.withValues(alpha: 0.5)),
                      const SizedBox(height: 12),
                      Text(
                          _query.isNotEmpty
                              ? 'No results for "$_query"'
                              : 'No suggestions right now',
                          style:
                              GoogleFonts.inter(fontWeight: FontWeight.w600)),
                    ]))
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _users.length + (hasMore ? 1 : 0),
                      itemBuilder: (ctx, i) {
                        if (i == _users.length) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Center(
                                child: TextButton(
                              onPressed: _loadingMore
                                  ? null
                                  : () =>
                                      _load(page: _page + 1, replace: false),
                              child: Text(_loadingMore
                                  ? 'Loading…'
                                  : 'Load more (${_total - _users.length} remaining)'),
                            )),
                          );
                        }
                        final u = _users[i];
                        final hasSent = u.friendRequestSent ||
                            _sent.any((r) => r.receiver.id == u.id);
                        return _UserCard(
                          user: u,
                          hasSent: hasSent,
                          isPending: _pending.contains(u.id),
                          onAdd: () => _sendRequest(u.id),
                          onWithdraw: () => _withdraw(u.id),
                          onAccept: () => _accept(u.id),
                        );
                      },
                    ),
        ),
      ],
    );
  }
}

class _UserCard extends StatelessWidget {
  final RecommendedUser user;
  final bool hasSent;
  final bool isPending;
  final VoidCallback onAdd;
  final VoidCallback onWithdraw;
  final VoidCallback onAccept;

  const _UserCard({
    required this.user,
    required this.hasSent,
    required this.isPending,
    required this.onAdd,
    required this.onWithdraw,
    required this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? ReonColors.cardDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)
              ],
      ),
      child: Row(children: [
        ChatAvatar(name: user.fullName, imageUrl: user.profilePic, size: 46),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(user.fullName,
              style:
                  GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          if (user.username != null)
            Text('@${user.username}',
                style: GoogleFonts.inter(
                    fontSize: 12, color: ReonColors.textMuted)),
          if ((user.mutualFriendsCount ?? 0) > 0)
            Text('${user.mutualFriendsCount} mutual',
                style: GoogleFonts.inter(
                    fontSize: 11,
                    color: ReonColors.primary,
                    fontWeight: FontWeight.w600)),
        ])),
        if (user.friendRequestReceived)
          _actionBtn(
              label: 'Accept',
              color: Colors.teal,
              icon: Icons.check_rounded,
              onTap: onAccept)
        else if (hasSent)
          _actionBtn(
              label: 'Withdraw',
              color: ReonColors.danger,
              icon: Icons.close_rounded,
              onTap: onWithdraw,
              outline: true)
        else
          _actionBtn(
              label: 'Add',
              color: ReonColors.primary,
              icon: Icons.person_add_rounded,
              onTap: onAdd,
              loading: isPending),
      ]),
    );
  }

  Widget _actionBtn(
      {required String label,
      required Color color,
      required IconData icon,
      required VoidCallback onTap,
      bool outline = false,
      bool loading = false}) {
    return Material(
      color: outline ? Colors.transparent : color,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: outline
              ? BoxDecoration(
                  border: Border.all(color: color.withValues(alpha: 0.5)),
                  borderRadius: BorderRadius.circular(10))
              : null,
          child: loading
              ? SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: outline ? color : Colors.white))
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 14, color: outline ? color : Colors.white),
                  const SizedBox(width: 4),
                  Text(label,
                      style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: outline ? color : Colors.white)),
                ]),
        ),
      ),
    );
  }
}
