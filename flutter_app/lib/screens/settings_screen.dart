import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/chat_avatar.dart';
import 'settings_link_device_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _name = TextEditingController();
  final _bio = TextEditingController();
  final _location = TextEditingController();
  final _curPw = TextEditingController();
  final _newPw = TextEditingController();

  String? _imagePath;
  bool _showLastSeen = true;
  bool _showActiveStatus = true;
  bool _profileSaving = false;
  bool _privacySaving = false;
  bool _pwSaving = false;
  String? _profileMsg;
  bool _profileOk = false;
  String? _privacyMsg;
  bool _privacyOk = false;
  String? _pwMsg;
  bool _pwOk = false;

  @override
  void initState() {
    super.initState();
    _syncFromUser();
  }

  void _syncFromUser() {
    final u = context.read<AuthProvider>().user;
    if (u == null) return;
    _name.text = u.fullName;
    _bio.text = u.bio ?? '';
    _location.text = u.location ?? '';
    _showLastSeen = u.privacySettings.showLastSeen;
    _showActiveStatus = u.privacySettings.showActiveStatus;
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _location.dispose();
    _curPw.dispose();
    _newPw.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 800);
    if (picked != null) setState(() => _imagePath = picked.path);
  }

  Future<void> _saveProfile() async {
    setState(() {
      _profileSaving = true;
      _profileMsg = null;
      _profileOk = false;
    });
    try {
      final updated = await ApiService.instance.updateProfile(
        fullName: _name.text.trim(),
        bio: _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        location: _location.text.trim().isEmpty ? null : _location.text.trim(),
        imagePath: _imagePath,
      );
      if (mounted) {
        context.read<AuthProvider>().updateUser(updated);
        setState(() {
          _profileMsg = 'Profile updated successfully.';
          _profileOk = true;
          _imagePath = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted)
        setState(() {
          _profileMsg = e.message;
          _profileOk = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _profileMsg = 'Failed to save.';
          _profileOk = false;
        });
    }
    if (mounted) setState(() => _profileSaving = false);
  }

  Future<void> _savePrivacy() async {
    setState(() {
      _privacySaving = true;
      _privacyMsg = null;
      _privacyOk = false;
    });
    try {
      final updated = await ApiService.instance.updatePrivacy(
        showLastSeen: _showLastSeen,
        showActiveStatus: _showActiveStatus,
      );
      if (mounted) {
        context.read<AuthProvider>().updateUser(updated);
        setState(() {
          _privacyMsg = 'Privacy settings saved.';
          _privacyOk = true;
        });
      }
    } on ApiException catch (e) {
      if (mounted)
        setState(() {
          _privacyMsg = e.message;
          _privacyOk = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _privacyMsg = 'Failed to save.';
          _privacyOk = false;
        });
    }
    if (mounted) setState(() => _privacySaving = false);
  }

  String? _validatePassword(String pw) {
    if (pw.length < 8 || pw.length > 14)
      return 'Password must be 8-14 characters long';
    if (!RegExp(r'[A-Z]').hasMatch(pw))
      return 'Must contain an uppercase letter';
    if (!RegExp(r'[a-z]').hasMatch(pw))
      return 'Must contain a lowercase letter';
    if (!RegExp(r'\d').hasMatch(pw)) return 'Must contain a number';
    if (!RegExp(r'[!@#$%^&*()_+\-=\[\]{};:"\\|,.<>\/?]').hasMatch(pw))
      return 'Must contain a special character';
    return null;
  }

  Future<void> _changePassword() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;
    if (user.hasPassword && _curPw.text.isEmpty) {
      setState(() {
        _pwMsg = 'Current password is required';
        _pwOk = false;
      });
      return;
    }
    final err = _validatePassword(_newPw.text);
    if (err != null) {
      setState(() {
        _pwMsg = err;
        _pwOk = false;
      });
      return;
    }

    setState(() {
      _pwSaving = true;
      _pwMsg = null;
      _pwOk = false;
    });
    try {
      await ApiService.instance.changePassword(
        currentPassword: _curPw.text,
        newPassword: _newPw.text,
      );
      if (mounted) {
        setState(() {
          _pwMsg = user.hasPassword
              ? 'Password changed successfully.'
              : 'Password set successfully.';
          _pwOk = true;
          _curPw.clear();
          _newPw.clear();
        });
      }
    } on ApiException catch (e) {
      if (mounted)
        setState(() {
          _pwMsg = e.message;
          _pwOk = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _pwMsg = 'Failed to change password.';
          _pwOk = false;
        });
    }
    if (mounted) setState(() => _pwSaving = false);
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Log out')),
        ],
      ),
    );
    if (ok == true && mounted) await context.read<AuthProvider>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(children: [
      Container(
        width: double.infinity,
        padding: EdgeInsets.fromLTRB(
            16, MediaQuery.of(context).padding.top + 8, 16, 12),
        decoration: BoxDecoration(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          border: Border(
              bottom: BorderSide(
                  color:
                      isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        ),
        child: Text('Settings',
            style:
                GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 20)),
      ),
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _sectionTitle('Profile'),
            Row(children: [
              Stack(children: [
                _imagePath != null
                    ? CircleAvatar(
                        radius: 36,
                        backgroundImage: FileImage(File(_imagePath!)))
                    : ChatAvatar(
                        name: user.fullName,
                        imageUrl: user.profilePic,
                        size: 72),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: GestureDetector(
                    onTap: _pickImage,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                          gradient: kBrandGradient, shape: BoxShape.circle),
                      child: const Icon(Icons.camera_alt_rounded,
                          size: 14, color: Colors.white),
                    ),
                  ),
                ),
              ]),
              const SizedBox(width: 16),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(user.fullName,
                        style: GoogleFonts.inter(
                            fontWeight: FontWeight.w600, fontSize: 16)),
                    Text(user.displayName,
                        style: GoogleFonts.inter(
                            fontSize: 13, color: ReonColors.textMuted)),
                  ])),
            ]),
            const SizedBox(height: 16),
            _field('Full Name', _name),
            const SizedBox(height: 12),
            _field('Bio', _bio, maxLines: 3),
            const SizedBox(height: 12),
            _field('Location', _location),
            if (_profileMsg != null) ...[
              const SizedBox(height: 8),
              Text(_profileMsg!,
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      color: _profileOk ? Colors.teal : ReonColors.danger)),
            ],
            const SizedBox(height: 12),
            _gradientBtn(
              label: _profileSaving ? 'Saving…' : 'Save Changes',
              icon: Icons.save_rounded,
              onTap: _profileSaving ? null : _saveProfile,
            ),
            const Divider(height: 32),
            _sectionTitle('Linked Devices'),
            Text(
              'Transfer your encryption keys securely to another device via QR code.',
              style:
                  GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted),
            ),
            const SizedBox(height: 12),
            _gradientBtn(
              label: 'Link New Device',
              icon: Icons.link_rounded,
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const SettingsLinkDeviceScreen())),
            ),
            const Divider(height: 32),
            _sectionTitle('Privacy'),
            SwitchListTile(
              title: const Text('Show Last Seen'),
              subtitle: const Text('Let others see when you were last active'),
              value: _showLastSeen,
              onChanged: (v) => setState(() => _showLastSeen = v),
            ),
            SwitchListTile(
              title: const Text('Show Online Status'),
              subtitle: const Text('Let others see when you are online'),
              value: _showActiveStatus,
              onChanged: (v) => setState(() => _showActiveStatus = v),
            ),
            if (_privacyMsg != null)
              Text(_privacyMsg!,
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      color: _privacyOk ? Colors.teal : ReonColors.danger)),
            const SizedBox(height: 8),
            _gradientBtn(
              label: _privacySaving ? 'Saving…' : 'Save Privacy',
              icon: Icons.shield_outlined,
              onTap: _privacySaving ? null : _savePrivacy,
            ),
            const Divider(height: 32),
            _sectionTitle(
                user.hasPassword ? 'Change Password' : 'Set Password'),
            if (!user.hasPassword)
              Text('Set a password to enable email/password login.',
                  style: GoogleFonts.inter(
                      fontSize: 13, color: ReonColors.textMuted)),
            if (user.hasPassword) ...[
              _field('Current Password', _curPw, obscure: true),
              const SizedBox(height: 12),
            ],
            _field('New Password', _newPw, obscure: true),
            if (_pwMsg != null) ...[
              const SizedBox(height: 8),
              Text(_pwMsg!,
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      color: _pwOk ? Colors.teal : ReonColors.danger)),
            ],
            const SizedBox(height: 12),
            _gradientBtn(
              label: _pwSaving
                  ? 'Updating…'
                  : (user.hasPassword ? 'Update Password' : 'Set Password'),
              icon: Icons.lock_outline_rounded,
              onTap: _pwSaving ? null : _changePassword,
            ),
            const Divider(height: 32),
            OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout_rounded, color: ReonColors.danger),
              label: Text('Log out',
                  style: GoogleFonts.inter(
                      color: ReonColors.danger, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: ReonColors.danger)),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    ]);
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(t.toUpperCase(),
            style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2,
                color: ReonColors.textMuted)),
      );

  Widget _field(String label, TextEditingController c,
          {int maxLines = 1, bool obscure = false}) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: ReonColors.textMuted,
                  letterSpacing: 0.8)),
          const SizedBox(height: 6),
          TextField(controller: c, maxLines: maxLines, obscureText: obscure),
        ],
      );

  Widget _gradientBtn(
      {required String label, required IconData icon, VoidCallback? onTap}) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
              gradient: kBrandGradient,
              borderRadius: BorderRadius.circular(14)),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 8),
              Text(label,
                  style: GoogleFonts.inter(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      ),
    );
  }
}
