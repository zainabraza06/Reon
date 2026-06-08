import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../services/crypto_service.dart';
import '../services/notification_service.dart';
import '../services/message_cache_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

enum AuthStatus { unknown, unauthenticated, authenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  ReonUser? _user;
  String? _error;

  AuthStatus get status => _status;
  ReonUser? get user => _user;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  Future<void> checkAuth() async {
    try {
      _user = await ApiService.instance.me();
      _status = AuthStatus.authenticated;
      await _postLogin();
    } catch (_) {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    try {
      _user = await ApiService.instance.login(email, password);
      _status = AuthStatus.authenticated;
      await _postLogin();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      // Non-ApiException (e.g. DioException timeout from _ensureKeys) — if login
      // itself succeeded, still navigate; otherwise surface a generic error.
      if (_status == AuthStatus.authenticated) {
        notifyListeners();
        return true;
      }
      _error = 'Connection failed. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> loginWithGoogle(String idToken) async {
    _error = null;
    try {
      _user = await ApiService.instance.loginWithGoogle(idToken);
      _status = AuthStatus.authenticated;
      await _postLogin();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      if (_status == AuthStatus.authenticated) {
        notifyListeners();
        return true;
      }
      _error = 'Google sign-in failed. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> signup(String fullName, String email, String password) async {
    _error = null;
    try {
      await ApiService.instance.signup(fullName, email, password);
      return await login(email, password);
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await NotificationService.instance.deleteToken().catchError((_) {});
    await MessageCacheService.instance.clearAll().catchError((_) {});
    await ApiService.instance.logout();
    SocketService.instance.disconnect();
    await CryptoService.instance.clearKeys();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  void updateOnlineStatus(String userId, bool isOnline) {
    if (_user?.id == userId) {
      _user = _user!.copyWith(isOnline: isOnline);
      notifyListeners();
    }
  }

  void updateUser(ReonUser user) {
    _user = user;
    notifyListeners();
  }

  Future<void> refreshUser() async {
    try {
      _user = await ApiService.instance.me();
      notifyListeners();
    } catch (_) {}
  }

  /// Called after successful auth: connect socket, upload FCM token, set up keys.
  Future<void> _postLogin() async {
    SocketService.instance.connect(_user!.id);
    // Upload FCM token NOW that we have an auth session — the token upload at app
    // start fails because there's no cookie yet.
    FirebaseMessaging.instance.getToken().then((token) {
      if (token != null)
        ApiService.instance.updateFcmToken(token).catchError((_) {});
    }).catchError((_) {});
    await _ensureKeys();
  }

  Future<void> _ensureKeys() async {
    try {
      final crypto = CryptoService.instance;
      final api = ApiService.instance;
      final userId = _user!.id;

      final localExists = await crypto.hasKeyPair();
      final serverKeyRaw = await api.tryGetPublicKey(userId);

      if (localExists && serverKeyRaw != null) return; // all good

      if (!localExists) {
        final pubJwk = await crypto.generateKeyPair();
        await api.uploadPublicKey(pubJwk, userId);
      } else {
        // Local key exists but not on server — re-upload
        final pubJwk = await crypto.getStoredPublicKey();
        if (pubJwk != null) await api.uploadPublicKey(pubJwk, userId);
      }
    } catch (_) {
      // Key setup is non-critical for login navigation — will be retried on
      // first message send. Don't block the user from reaching HomeScreen.
    }
  }
}
