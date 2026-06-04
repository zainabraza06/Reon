import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import 'chat_list_screen.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _nameCtrl     = TextEditingController();
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPw   = false;
  bool _loading  = false;
  String? _error;

  int get _strength {
    final pw = _passwordCtrl.text;
    if (pw.isEmpty) return 0;
    if (pw.length < 8) return 1;
    if (pw.length < 12) return 2;
    return 3;
  }

  Color get _strengthColor => [Colors.transparent, ReonColors.danger, ReonColors.warning, ReonColors.online][_strength];
  String get _strengthLabel => ['', 'Weak', 'Good', 'Strong'][_strength];

  Future<void> _submit() async {
    if (_nameCtrl.text.isEmpty || _emailCtrl.text.isEmpty || _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Please fill in all fields');
      return;
    }
    if (_passwordCtrl.text.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters');
      return;
    }
    setState(() { _loading = true; _error = null; });
    await Future.delayed(const Duration(seconds: 1));
    setState(() => _loading = false);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const ChatListScreen()));
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : const Color(0xFFF8F7FF),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new, size: 18, color: isDark ? Colors.white : ReonColors.textLight),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.3), blurRadius: 16)]),
                  child: const Center(child: Text('R', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900))),
                )),
                const SizedBox(height: 24),
                Text('Create account', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white : ReonColors.textLight)),
                const SizedBox(height: 4),
                Text('Join Reon for encrypted messaging', style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
                const SizedBox(height: 28),

                _label('Full Name'),
                TextField(controller: _nameCtrl, textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(hintText: 'Jane Doe', prefixIcon: Icon(Icons.person_outline, size: 18))),
                const SizedBox(height: 14),

                _label('Email'),
                TextField(controller: _emailCtrl, keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(hintText: 'you@example.com', prefixIcon: Icon(Icons.email_outlined, size: 18))),
                const SizedBox(height: 14),

                _label('Password'),
                StatefulBuilder(builder: (_, ss) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: _passwordCtrl,
                      obscureText: !_showPw,
                      onChanged: (_) => ss(() {}),
                      decoration: InputDecoration(
                        hintText: 'Min. 8 characters',
                        prefixIcon: const Icon(Icons.lock_outline, size: 18),
                        suffixIcon: IconButton(
                          icon: Icon(_showPw ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
                          onPressed: () => setState(() => _showPw = !_showPw),
                        ),
                      ),
                    ),
                    if (_passwordCtrl.text.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Row(children: [
                        ...List.generate(3, (i) => Expanded(child: Container(
                          margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
                          height: 4,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(99),
                            color: _strength > i ? _strengthColor : (isDark ? ReonColors.borderDark : ReonColors.borderLight),
                          ),
                        ))),
                        const SizedBox(width: 8),
                        Text(_strengthLabel, style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600, color: _strengthColor)),
                      ]),
                    ],
                  ],
                )),

                if (_error != null) ...[
                  const SizedBox(height: 12),
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
                const SizedBox(height: 22),

                _GradientButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : Text('Create Account', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15, color: Colors.white)),
                ),
                const SizedBox(height: 24),
                Center(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('Already have an account? ', style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Text('Sign in', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, color: ReonColors.primary)),
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
