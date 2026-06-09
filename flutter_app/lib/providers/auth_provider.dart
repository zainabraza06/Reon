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
  bool _needsDeviceLink = false;

  AuthStatus get status => _status;
  ReonUser? get user => _user;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  /// True when the server has this user's public key but the current device
  /// has no private key — meaning the user must link this device from their
  /// original device before reading encrypted messages.
  bool get needsDeviceLink => _needsDeviceLink;

  void clearNeedsDeviceLink() {
    _needsDeviceLink = false;
    notifyListeners();
  }

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
      // Redirect immediately — don't make the user wait for key setup.
      notifyListeners();
      // Run post-login work in background; call notifyListeners again so the
      // device-link gate appears if _ensureKeys sets _needsDeviceLink = true.
      _postLogin().then((_) => notifyListeners()).catchError((_) {});
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
      notifyListeners();
      _postLogin().then((_) => notifyListeners()).catchError((_) {});
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
    _needsDeviceLink = false;
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
      if (token != null) {
        ApiService.instance.updateFcmToken(token).catchError((_) {});
      }
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

      // Case 1: all good — both local and server have the key
      if (localExists && serverKeyRaw != null) return;

      // Case 2: local key but not on server — re-upload (e.g. server was wiped)
      if (localExists && serverKeyRaw == null) {
        final pubJwk = await crypto.getStoredPublicKey();
        if (pubJwk != null) {
          await api.uploadPublicKey(pubJwk, userId);
        }
        return;
      }

      // Case 3: new user — no key anywhere — generate fresh key pair
      if (!localExists && serverKeyRaw == null) {
        final pubJwk = await crypto.generateKeyPair();
        await api.uploadPublicKey(pubJwk, userId);
        return;
      }

      // Case 4: server has a key but this device doesn't — existing user on a
      // new/unlinked device. Do NOT generate new keys (that would invalidate all
      // their existing encrypted messages). Prompt device linking instead.
      _needsDeviceLink = true;
    } catch (_) {
      // Key setup is non-critical for login navigation — will be retried on
      // first message send. Don't block the user from reaching HomeScreen.
    }
  }
}
