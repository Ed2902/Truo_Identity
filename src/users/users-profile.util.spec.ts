import {
  buildApproximateLocation,
  calculateAccountAgeDays,
  isProfileCompleted,
  normalizeApproximateCoordinate,
  resolveAvatarVerificationStatus,
} from './users-profile.util';

describe('users-profile.util', () => {
  it('rounds coordinates to preserve approximate location privacy', () => {
    expect(normalizeApproximateCoordinate(4.711234)).toBe(4.711);
    expect(normalizeApproximateCoordinate(-74.072156)).toBe(-74.072);
  });

  it('builds an approximate location summary ready for distance calculations', () => {
    expect(
      buildApproximateLocation({
        city: 'Bogota',
        latitude: 4.711234,
        longitude: -74.072156,
      }),
    ).toEqual({
      city: 'Bogota',
      latitude: 4.711,
      longitude: -74.072,
      precision: 'approximate',
      distanceReady: true,
    });
  });

  it('calculates account age in days using the user creation date', () => {
    expect(
      calculateAccountAgeDays(
        new Date('2026-04-10T00:00:00.000Z'),
        new Date('2026-04-15T00:00:00.000Z'),
      ),
    ).toBe(5);
  });

  it('requires city for a completed profile', () => {
    expect(
      isProfileCompleted({
        phone: '+573001112233',
        firstName: 'Ana',
        city: 'Bogota',
      }),
    ).toBe(true);

    expect(
      isProfileCompleted({
        phone: '+573001112233',
        firstName: 'Ana',
        city: '',
      }),
    ).toBe(false);
  });

  it('resolves avatar verification lifecycle states from current profile data', () => {
    expect(
      resolveAvatarVerificationStatus({
        avatarUrl: null,
        isAvatarVerified: false,
      }),
    ).toBe('missing_avatar');

    expect(
      resolveAvatarVerificationStatus({
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        isAvatarVerified: false,
        avatarVectorUpdatedAt: null,
        lastAvatarValidationAt: null,
      }),
    ).toBe('pending_vectorization');

    expect(
      resolveAvatarVerificationStatus({
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        isAvatarVerified: false,
        avatarVectorUpdatedAt: new Date('2026-04-15T10:00:00.000Z'),
        lastAvatarValidationAt: null,
      }),
    ).toBe('ready_for_validation');

    expect(
      resolveAvatarVerificationStatus({
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        isAvatarVerified: true,
        avatarVectorUpdatedAt: new Date('2026-04-15T10:00:00.000Z'),
        lastAvatarValidationAt: new Date('2026-04-15T10:05:00.000Z'),
      }),
    ).toBe('verified');
  });
});
