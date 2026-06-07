import 'package:flutter_test/flutter_test.dart';
import 'package:reon/models/message.dart';
import 'package:reon/models/user.dart';
import 'package:reon/models/friend_request.dart';
import 'package:reon/models/notification.dart';

void main() {
  group('ChatMessage', () {
    final sampleJson = {
      '_id': 'msg123',
      'sender': 'user1',
      'receiver': 'user2',
      'ciphertext': 'encryptedContent==',
      'encryptedKey': 'encryptedKey==',
      'contentType': 'text',
      'media': <dynamic>[],
      'sentAt': '2024-01-15T10:30:00.000Z',
      'delivered': true,
      'deliveredAt': '2024-01-15T10:30:01.000Z',
      'read': false,
      'status': 'delivered',
      'isVoiceMessage': false,
    };

    test('fromJson parses all fields correctly', () {
      final msg = ChatMessage.fromJson(sampleJson);

      expect(msg.id, 'msg123');
      expect(msg.sender, 'user1');
      expect(msg.receiver, 'user2');
      expect(msg.ciphertext, 'encryptedContent==');
      expect(msg.contentType, 'text');
      expect(msg.delivered, true);
      expect(msg.read, false);
      expect(msg.status, 'delivered');
      expect(msg.isVoiceMessage, false);
    });

    test('fromJson handles nested sender/receiver objects', () {
      final jsonWithObjects = {
        ...sampleJson,
        'sender': {'_id': 'user1', 'fullName': 'Alice'},
        'receiver': {'_id': 'user2', 'fullName': 'Bob'},
      };
      final msg = ChatMessage.fromJson(jsonWithObjects);
      expect(msg.sender, 'user1');
      expect(msg.receiver, 'user2');
    });

    test('fromJson defaults missing optional fields', () {
      final minimal = {
        '_id': 'msg1',
        'sender': 'u1',
        'receiver': 'u2',
        'sentAt': '2024-01-01T00:00:00.000Z',
      };
      final msg = ChatMessage.fromJson(minimal);
      expect(msg.contentType, 'text');
      expect(msg.delivered, false);
      expect(msg.read, false);
      expect(msg.status, 'sent');
      expect(msg.isVoiceMessage, false);
      expect(msg.media, isEmpty);
    });

    test('copyWith updates specified fields only', () {
      final msg = ChatMessage.fromJson(sampleJson);
      final updated = msg.copyWith(status: 'read', read: true);

      expect(updated.status, 'read');
      expect(updated.read, true);
      expect(updated.id, msg.id);       // unchanged
      expect(updated.sender, msg.sender); // unchanged
    });

    test('isSending is true only for sending status', () {
      final sending = ChatMessage.fromJson({...sampleJson, 'status': 'sending'});
      final sent    = ChatMessage.fromJson({...sampleJson, 'status': 'sent'});
      expect(sending.isSending, true);
      expect(sent.isSending, false);
    });

    test('isFailed is true only for failed status', () {
      final failed = ChatMessage.fromJson({...sampleJson, 'status': 'failed'});
      final sent   = ChatMessage.fromJson({...sampleJson, 'status': 'sent'});
      expect(failed.isFailed, true);
      expect(sent.isFailed, false);
    });
  });

  group('ReonUser', () {
    final sampleJson = {
      '_id': 'user123',
      'fullName': 'Alice Smith',
      'email': 'alice@reon.dev',
      'username': 'alice',
      'profilePic': 'https://cdn.example.com/alice.jpg',
      'isOnboarded': true,
      'privacySettings': {
        'showLastSeen': true,
        'showActiveStatus': false,
      },
    };

    test('fromJson parses all fields', () {
      final user = ReonUser.fromJson(sampleJson);

      expect(user.id, 'user123');
      expect(user.fullName, 'Alice Smith');
      expect(user.email, 'alice@reon.dev');
      expect(user.username, 'alice');
      expect(user.isOnboarded, true);
      expect(user.privacySettings.showLastSeen, true);
      expect(user.privacySettings.showActiveStatus, false);
    });

    test('fromJson handles missing optional fields', () {
      final minimal = {
        '_id': 'u1',
        'fullName': 'Bob',
        'email': 'bob@reon.dev',
      };
      final user = ReonUser.fromJson(minimal);
      expect(user.id, 'u1');
      expect(user.isOnboarded, false);
      expect(user.bio, isNull);
    });

    test('copyWith updates isOnline without changing other fields', () {
      final user = ReonUser.fromJson(sampleJson);
      final updated = user.copyWith(isOnline: true);

      expect(updated.isOnline, true);
      expect(updated.id, user.id);
      expect(updated.fullName, user.fullName);
    });
  });

  group('AppNotification', () {
    final sampleJson = {
      '_id': 'notif1',
      'type': 'friend_request',
      'title': 'New friend request',
      'body': 'Alice sent you a request',
      'read': false,
      'createdAt': '2024-01-15T09:00:00.000Z',
    };

    test('fromJson parses correctly', () {
      final notif = AppNotification.fromJson(sampleJson);

      expect(notif.id, 'notif1');
      expect(notif.type, 'friend_request');
      expect(notif.read, false);
    });

    test('fromJson defaults read to false when missing', () {
      final notif = AppNotification.fromJson({
        ...sampleJson,
        'read': null,
      });
      expect(notif.read, false);
    });
  });

  group('FriendRequest', () {
    test('fromJson parses status field', () {
      final json = {
        '_id': 'req1',
        'sender': {'_id': 'u1', 'fullName': 'Alice', 'email': 'a@b.com'},
        'receiver': {'_id': 'u2', 'fullName': 'Bob', 'email': 'b@c.com'},
        'status': 'pending',
        'createdAt': '2024-01-01T00:00:00.000Z',
      };
      final req = FriendRequest.fromJson(json);
      expect(req.id, 'req1');
      expect(req.status, 'pending');
    });
  });
}
