import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import 'signup_screen.dart';
import 'chat_list_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPw   = false;
  bool _loading  = false;
  String? _error;

  Future<void> _submit() async {
    if (_emailCtrl.text.isEmpty || _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Please fill in all fields');
      return;
    }
    setState(() { _loading = true; _error = null; });
    await Future.delayed(const Duration(seconds: 1)); // simulate API
    setState(() => _loading = false);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const ChatListScreen()));
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isWide = size.width > 700;

    return Scaffold(
      body: isWide ? _wideLayout(context) : _narrowLayout(context),
    );
  }

  // ── Wide (tablet / desktop) ─────────────────────────────────────────────────
  Widget _wideLayout(BuildContext context) => Row(
    children: [
      Expanded(flex: 4, child: _brandPanel()),
      Expanded(flex: 5, child: _formPanel(context)),
    ],
  );

  // ── Narrow (phone) ──────────────────────────────────────────────────────────
  Widget _narrowLayout(BuildContext context) => _formPanel(context);

  // ── Brand panel ─────────────────────────────────────────────────────────────
  Widget _brandPanel() => Container(
    decoration: const BoxDecoration(gradient: kPanelGradient),
    padding: const EdgeInsets.all(48),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56, height: 56,
          decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.4), blurRadius: 20, offset: const Offset(0, 8))]),
          child: const Center(child: Text('R', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900))),
        ),
        const SizedBox(height: 28),
        Text('Reon', style: GoogleFonts.inter(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w900, height: 1)),
        const SizedBox(height: 10),
        Text('The only messenger where privacy\nis not optional.',
            style: GoogleFonts.inter(color: const Color(0xFFD8B4FE), fontSize: 15, height: 1.6)),
        const SizedBox(height: 40),
        ...[
          ('🔐', 'End-to-end encryption',  'Only you & your contacts can read messages'),
          ('⚡', 'Voice & video calls',     'Crystal-clear HD calls, always encrypted'),
          ('👥', 'Group chats',             'Secure conversations up to 500 members'),
          ('📎', 'Secure file sharing',     'Share files without exposing your data'),
        ].map((item) => Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: ReonColors.primary.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ReonColors.primary.withValues(alpha: 0.45)),
                ),
                child: Center(child: Text(item.$1, style: const TextStyle(fontSize: 16))),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.$2, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(item.$3, style: GoogleFonts.inter(color: const Color(0xFFC4B5FD), fontSize: 12, height: 1.4)),
                ],
              )),
            ],
          ),
        )),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          ),
          child: Row(
            children: [
              Icon(Icons.shield_outlined, color: ReonColors.accent, size: 18),
              const SizedBox(width: 10),
              Expanded(child: Text('256-bit AES encryption · Zero-knowledge architecture',
                  style: GoogleFonts.inter(color: const Color(0xFFD8B4FE), fontSize: 12))),
            ],
          ),
        ),
      ],
    ),
  );

  // ── Form panel ──────────────────────────────────────────────────────────────
  Widget _formPanel(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: isDark ? ReonColors.bgDark : const Color(0xFFF8F7FF),
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Mobile logo
                Center(child: Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.3), blurRadius: 16)]),
                  child: const Center(child: Text('R', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900))),
                )),
                const SizedBox(height: 28),
                Text('Welcome back', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white : ReonColors.textLight)),
                const SizedBox(height: 4),
                Text('Sign in to continue to Reon', style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
                const SizedBox(height: 28),

                // Email
                _label('Email'),
                TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    hintText: 'you@example.com',
                    prefixIcon: const Icon(Icons.email_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 14),

                // Password
                _label('Password'),
                TextField(
                  controller: _passwordCtrl,
                  obscureText: !_showPw,
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    prefixIcon: const Icon(Icons.lock_outline, size: 18),
                    suffixIcon: IconButton(
                      icon: Icon(_showPw ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
                      onPressed: () => setState(() => _showPw = !_showPw),
                    ),
                  ),
                ),
                const SizedBox(height: 6),

                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.red.withValues(alpha: 0.2)),
                    ),
                    child: Row(children: [
                      const Icon(Icons.warning_amber_outlined, color: Colors.red, size: 16),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13))),
                    ]),
                  ),
                ],
                const SizedBox(height: 20),

                // Sign In button
                _GradientButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : Text('Sign In', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15, color: Colors.white)),
                ),
                const SizedBox(height: 20),

                // Divider
                Row(children: [
                  const Expanded(child: Divider()),
                  Padding(padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text('Or continue with', style: GoogleFonts.inter(fontSize: 12, color: ReonColors.textMuted))),
                  const Expanded(child: Divider()),
                ]),
                const SizedBox(height: 16),

                // Google button
                _OutlineButton(
                  onPressed: () {},
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Image.network(
                      'https://www.google.com/favicon.ico',
                      width: 18, height: 18,
                      errorBuilder: (_, __, ___) => const Icon(Icons.g_mobiledata, size: 22),
                    ),
                    const SizedBox(width: 8),
                    Text('Continue with Google', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14,
                        color: isDark ? Colors.white : ReonColors.textLight)),
                  ]),
                ),
                const SizedBox(height: 24),

                Center(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text("No account? ", style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SignupScreen())),
                    child: Text('Create one', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, color: ReonColors.primary)),
                  ),
                ])),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text.toUpperCase(), style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1.1, color: ReonColors.textMuted)),
  );
}

// ── Shared button widgets ──────────────────────────────────────────────────────

class _GradientButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  const _GradientButton({required this.onPressed, required this.child});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onPressed,
    child: AnimatedOpacity(
      opacity: onPressed == null ? 0.55 : 1.0,
      duration: const Duration(milliseconds: 200),
      child: Container(
        height: 50,
        decoration: BoxDecoration(
          gradient: kBrandGradient,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Center(child: child),
      ),
    ),
  );
}

class _OutlineButton extends StatelessWidget {
  final VoidCallback onPressed;
  final Widget child;
  const _OutlineButton({required this.onPressed, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        height: 50,
        decoration: BoxDecoration(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isDark ? ReonColors.borderDark : ReonColors.borderLight),
        ),
        child: child,
      ),
    );
  }
}
