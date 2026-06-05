import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email    = TextEditingController();
  final _password = TextEditingController();
  bool _showPw = false;
  bool _loading = false;

  @override void dispose() { _email.dispose(); _password.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) return;
    setState(() => _loading = true);
    final ok = await context.read<AuthProvider>().login(_email.text.trim(), _password.text);
    if (!ok && mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final error  = context.watch<AuthProvider>().error;

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: SafeArea(child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 48),
          Center(child: Container(width: 64, height: 64,
            decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 20, offset: const Offset(0, 6))]),
            child: Center(child: Text('R', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white))))),
          const SizedBox(height: 32),
          Text('Welcome back', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 26, fontWeight: FontWeight.w800, color: isDark ? Colors.white : ReonColors.textLight)),
          const SizedBox(height: 6),
          Text('Sign in to continue', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
          const SizedBox(height: 36),
          _AuthField(controller: _email, hint: 'Email', icon: Icons.mail_outline_rounded, type: TextInputType.emailAddress),
          const SizedBox(height: 14),
          _AuthField(controller: _password, hint: 'Password', icon: Icons.lock_outline_rounded, obscure: !_showPw,
            suffix: IconButton(icon: Icon(_showPw ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 20, color: ReonColors.textMuted),
              onPressed: () => setState(() => _showPw = !_showPw))),
          if (error != null) ...[
            const SizedBox(height: 12),
            _ErrorBox(error),
          ],
          const SizedBox(height: 24),
          _GradButton(label: 'Sign In', loading: _loading, onTap: _loading ? null : _submit),
          const SizedBox(height: 20),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text("Don't have an account? ", style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
            GestureDetector(
              onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const SignupScreen())),
              child: Text('Sign up', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w700, color: ReonColors.primary))),
          ]),
        ]),
      )),
    );
  }
}

// ── Shared widgets ─────────────────────────────────────────────────────────────

class _AuthField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final bool obscure;
  final TextInputType type;
  final Widget? suffix;
  const _AuthField({required this.controller, required this.hint, required this.icon,
    this.obscure = false, this.type = TextInputType.text, this.suffix});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return TextField(
      controller: controller, obscureText: obscure, keyboardType: type,
      style: GoogleFonts.inter(fontSize: 14.5, color: isDark ? ReonColors.textDark : ReonColors.textLight),
      decoration: InputDecoration(
        hintText: hint, hintStyle: GoogleFonts.inter(fontSize: 14.5, color: ReonColors.textMuted),
        prefixIcon: Icon(icon, size: 20, color: ReonColors.textMuted), suffixIcon: suffix,
        filled: true, fillColor: isDark ? ReonColors.surfaceDark : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border:        OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.primary, width: 1.5)),
      ),
    );
  }
}

class _GradButton extends StatelessWidget {
  final String label; final bool loading; final VoidCallback? onTap;
  const _GradButton({required this.label, required this.loading, this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(height: 52, decoration: BoxDecoration(
      gradient: onTap != null ? kBrandGradient : null,
      color: onTap == null ? Colors.grey.shade300 : null,
      borderRadius: BorderRadius.circular(14),
      boxShadow: onTap != null ? [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 4))] : null),
      child: Center(child: loading
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
        : Text(label, style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)))));
}

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox(this.message);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: ReonColors.danger.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12),
      border: Border.all(color: ReonColors.danger.withValues(alpha: 0.3))),
    child: Text(message, style: GoogleFonts.inter(fontSize: 13, color: ReonColors.danger)));
}

// Export shared widgets so other screens can reuse them
class AuthField extends _AuthField {
  const AuthField({super.key, required super.controller, required super.hint, required super.icon,
    super.obscure, super.type, super.suffix});
}
class GradButton extends _GradButton {
  const GradButton({super.key, required super.label, required super.loading, super.onTap});
}
class ErrorBox extends _ErrorBox {
  const ErrorBox(super.message, {super.key});
}
