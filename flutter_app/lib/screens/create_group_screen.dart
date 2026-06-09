import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../widgets/chat_avatar.dart';
import 'login_screen.dart' show AuthField, GradButton, ErrorBox;

class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});
  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final _name = TextEditingController();
  final _desc = TextEditingController();
  List<ReonUser> _friends = [];
  final Set<String> _selected = {};
  bool _loadingFriends = true;
  bool _creating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _loadFriends() async {
    try {
      final friends = await ApiService.instance.getFriends();
      if (mounted) setState(() { _friends = friends; _loadingFriends = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingFriends = false);
    }
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Group name is required');
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Select at least one member');
      return;
    }
    setState(() { _creating = true; _error = null; });
    try {
      await ApiService.instance.createGroup(
        name: _name.text.trim(),
        description: _desc.text.trim().isEmpty ? null : _desc.text.trim(),
        memberIds: _selected.toList(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _creating = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      appBar: AppBar(
        title: Text('New Group',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              AuthField(
                  controller: _name,
                  hint: 'Group name *',
                  icon: Icons.group_rounded),
              const SizedBox(height: 12),
              AuthField(
                  controller: _desc,
                  hint: 'Description (optional)',
                  icon: Icons.edit_note_rounded),
              const SizedBox(height: 20),
              Text('Add Members (${_selected.length} selected)',
                  style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDark ? ReonColors.textDark : ReonColors.textLight)),
              const SizedBox(height: 10),
              if (_loadingFriends)
                const Center(child: CircularProgressIndicator())
              else if (_friends.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text('No friends to add yet',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                          color: ReonColors.textMuted, fontSize: 14)),
                )
              else
                Container(
                  decoration: BoxDecoration(
                    color: isDark ? ReonColors.surfaceDark : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color: isDark
                            ? ReonColors.borderDark
                            : ReonColors.borderLight),
                  ),
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _friends.length,
                    separatorBuilder: (_, __) => Divider(
                        height: 1,
                        color: isDark
                            ? ReonColors.borderDark
                            : ReonColors.borderLight),
                    itemBuilder: (_, i) {
                      final f = _friends[i];
                      final checked = _selected.contains(f.id);
                      return InkWell(
                        onTap: () => setState(() {
                          if (checked) _selected.remove(f.id);
                          else _selected.add(f.id);
                        }),
                        borderRadius: i == 0
                            ? const BorderRadius.vertical(
                                top: Radius.circular(14))
                            : i == _friends.length - 1
                                ? const BorderRadius.vertical(
                                    bottom: Radius.circular(14))
                                : BorderRadius.zero,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          child: Row(children: [
                            ChatAvatar(
                                name: f.fullName,
                                imageUrl: f.profilePic,
                                size: 40),
                            const SizedBox(width: 12),
                            Expanded(
                                child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                  Text(f.fullName,
                                      style: GoogleFonts.inter(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                          color: isDark
                                              ? ReonColors.textDark
                                              : ReonColors.textLight)),
                                  if (f.username != null)
                                    Text('@${f.username}',
                                        style: GoogleFonts.inter(
                                            fontSize: 12,
                                            color: ReonColors.textMuted)),
                                ])),
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: checked ? kBrandGradient : null,
                                  border: checked
                                      ? null
                                      : Border.all(
                                          color: ReonColors.textMuted
                                              .withValues(alpha: 0.5))),
                              child: checked
                                  ? const Icon(Icons.check_rounded,
                                      color: Colors.white, size: 14)
                                  : null,
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                ErrorBox(_error!),
              ],
            ]),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(
              20, 8, 20, MediaQuery.of(context).padding.bottom + 12),
          child: GradButton(
              label: 'Create Group',
              loading: _creating,
              onTap: _creating ? null : _submit),
        ),
      ]),
    );
  }
}
