import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Brand colours ─────────────────────────────────────────────────────────────
class ReonColors {
  ReonColors._();

  static const primary     = Color(0xFF7C3AED); // violet-600
  static const primaryDark = Color(0xFF6D28D9); // violet-700
  static const accent      = Color(0xFF06B6D4); // cyan-500
  static const accentDark  = Color(0xFF0891B2); // cyan-600

  // Gradient stops
  static const gradientStart = primary;
  static const gradientEnd   = accent;

  // Dark backgrounds
  static const bgDark        = Color(0xFF0C0C1E);
  static const surfaceDark   = Color(0xFF12122E);
  static const cardDark      = Color(0xFF1A1A3A);
  static const borderDark    = Color(0xFF2A2A50);

  // Light backgrounds
  static const bgLight      = Color(0xFFF8F7FF);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const cardLight    = Color(0xFFF5F3FF);
  static const borderLight  = Color(0xFFE5E7EB);

  // Text
  static const textDark    = Color(0xFFE2E8F0);
  static const textLight   = Color(0xFF1E1B4B);
  static const textMuted   = Color(0xFF94A3B8);
  static const textMutedDk = Color(0xFF64748B);

  // Status
  static const online  = Color(0xFF10B981);
  static const danger  = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
}

// ── Gradient helpers ──────────────────────────────────────────────────────────
const kBrandGradient = LinearGradient(
  begin: Alignment.topLeft,
  end:   Alignment.bottomRight,
  colors: [ReonColors.gradientStart, ReonColors.gradientEnd],
);

const kPanelGradient = LinearGradient(
  begin: Alignment.topLeft,
  end:   Alignment.bottomRight,
  colors: [Color(0xFF110127), Color(0xFF2A0D6E), Color(0xFF0C1A4A)],
  stops: [0.0, 0.45, 1.0],
);

BoxDecoration gradientBubbleDecoration({bool roundTL = true, bool roundTR = true, bool roundBL = true, bool roundBR = true}) {
  return BoxDecoration(
    gradient: kBrandGradient,
    borderRadius: BorderRadius.only(
      topLeft:     Radius.circular(roundTL ? 18 : 4),
      topRight:    Radius.circular(roundTR ? 18 : 4),
      bottomLeft:  Radius.circular(roundBL ? 18 : 4),
      bottomRight: Radius.circular(roundBR ? 18 : 4),
    ),
    boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 3))],
  );
}

// ── Theme builder ─────────────────────────────────────────────────────────────
class AppTheme {
  AppTheme._();

  static TextTheme _textTheme(Color primary, Color secondary) => GoogleFonts.interTextTheme().copyWith(
    displayLarge:  GoogleFonts.inter(color: primary, fontWeight: FontWeight.w900),
    displayMedium: GoogleFonts.inter(color: primary, fontWeight: FontWeight.w800),
    titleLarge:    GoogleFonts.inter(color: primary, fontWeight: FontWeight.w700, fontSize: 18),
    titleMedium:   GoogleFonts.inter(color: primary, fontWeight: FontWeight.w600, fontSize: 16),
    bodyLarge:     GoogleFonts.inter(color: primary, fontSize: 15),
    bodyMedium:    GoogleFonts.inter(color: primary, fontSize: 14),
    bodySmall:     GoogleFonts.inter(color: secondary, fontSize: 12),
    labelSmall:    GoogleFonts.inter(color: secondary, fontSize: 11),
  );

  static ThemeData get light => ThemeData(
    useMaterial3:   true,
    brightness:     Brightness.light,
    colorScheme:    ColorScheme.fromSeed(
      seedColor:    ReonColors.primary,
      brightness:   Brightness.light,
      primary:      ReonColors.primary,
      secondary:    ReonColors.accent,
      surface:      ReonColors.surfaceLight,
    ),
    scaffoldBackgroundColor: ReonColors.bgLight,
    textTheme:      _textTheme(ReonColors.textLight, ReonColors.textMutedDk),
    appBarTheme:    AppBarTheme(
      backgroundColor: ReonColors.surfaceLight,
      foregroundColor: ReonColors.textLight,
      elevation: 0,
      scrolledUnderElevation: 1,
      shadowColor: ReonColors.borderLight,
      titleTextStyle: GoogleFonts.inter(color: ReonColors.textLight, fontWeight: FontWeight.w700, fontSize: 17),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled:        true,
      fillColor:     ReonColors.surfaceLight,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.borderLight)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.borderLight)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.primary, width: 2)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: ReonColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        minimumSize: const Size(double.infinity, 50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
  );

  static ThemeData get dark => ThemeData(
    useMaterial3:   true,
    brightness:     Brightness.dark,
    colorScheme:    ColorScheme.fromSeed(
      seedColor:    ReonColors.primary,
      brightness:   Brightness.dark,
      primary:      ReonColors.primary,
      secondary:    ReonColors.accent,
      surface:      ReonColors.surfaceDark,
    ),
    scaffoldBackgroundColor: ReonColors.bgDark,
    textTheme:      _textTheme(ReonColors.textDark, ReonColors.textMuted),
    appBarTheme:    AppBarTheme(
      backgroundColor: ReonColors.surfaceDark,
      foregroundColor: ReonColors.textDark,
      elevation: 0,
      scrolledUnderElevation: 1,
      shadowColor: Colors.black54,
      titleTextStyle: GoogleFonts.inter(color: ReonColors.textDark, fontWeight: FontWeight.w700, fontSize: 17),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled:        true,
      fillColor:     ReonColors.surfaceDark,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.borderDark)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.borderDark)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.primary, width: 2)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: ReonColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        minimumSize: const Size(double.infinity, 50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
  );
}
