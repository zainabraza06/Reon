import 'package:flutter_test/flutter_test.dart';
import 'package:reon/providers/auth_provider.dart';
import 'package:reon/models/user.dart';

final _testUser = ReonUser(
  id: 'user1',
  fullName: 'Alice',
  email: 'alice@reon.dev',
  isOnboarded: true,
);

void main() {
  late AuthProvider provider;

  setUp(() {
    provider = AuthProvider();
  });

  group('AuthProvider — initial state', () {
    test('starts with unknown status', () {
      expect(provider.status, AuthStatus.unknown);
      expect(provider.user, isNull);
      expect(provider.error, isNull);
    });
  });

  group('AuthProvider — updateUser', () {
    test('updates user and notifies listeners', () {
      int notifyCount = 0;
      provider.addListener(() => notifyCount++);

      provider.updateUser(_testUser);

      expect(provider.user, _testUser);
      expect(notifyCount, 1);
    });
  });

  group('AuthProvider — updateOnlineStatus', () {
    test('updates isOnline for matching userId', () {
      provider.updateUser(_testUser);
      provider.updateOnlineStatus('user1', true);

      expect(provider.user?.isOnline, true);
    });

    test('ignores unknown userId', () {
      provider.updateUser(_testUser);
      provider.updateOnlineStatus('unknown_user', true);

      expect(provider.user?.isOnline, false);
    });
  });
}
