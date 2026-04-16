# Identity Signals Contract For Catalog

## Purpose

Identity is the source of user identity data and user-level signals.

Catalog may consume these signals later for visibility, feed logic, ranking, and business rules, but Identity does not calculate the final ranking.

## Architecture Decisions

- Identity does not calculate ranking.
- Identity does not persist or calculate user reputation.
- Catalog will be the future source of truth for reputation once completed trades and ratings exist.
- Identity may later reflect that reputation summary, but it does not own it in this phase.

## Where Catalog Should Read Signals

Catalog can consume the normalized `signals` block returned by the authenticated Identity flows.

Current response families that expose the same signal contract:

- auth responses
- profile response

## Final Signals Available

### `isPremium`

- Type: boolean
- Meaning: whether the user currently has an active premium membership
- Source of truth: premium membership state in Identity

### `verificationStatus`

- Type: enum
- Values:
  - `missing_avatar`
  - `pending_vectorization`
  - `ready_for_validation`
  - `verified`
  - `rejected`
- Meaning: normalized lifecycle of the user's avatar verification

### `avatarVerifiedAt`

- Type: nullable datetime
- Meaning: timestamp of the latest successful avatar verification

### `accountCreatedAt`

- Type: datetime
- Meaning: base date used for account age and seniority
- Source of truth: `User.createdAt`

### `accountAgeDays`

- Type: nullable number
- Meaning: age of the account in whole days derived from `accountCreatedAt`

### `city`

- Type: nullable string in the signal contract, but operationally required in profile completion
- Meaning: descriptive city reference of the user

### `approximateLocation`

- Type: nullable object
- Fields:
  - `city`
  - `latitude`
  - `longitude`
  - `precision`
  - `distanceReady`
- Meaning: privacy-preserving location summary for future distance calculations
- Notes:
  - city is required for user completion
  - coordinates are optional
  - coordinates are stored and exposed approximately, not as an exact street address

### `reputationSummary`

- Type: null
- Current behavior: always `null`
- Reason: reputation will be owned by Catalog when completed trade flows exist

## Additional User Fields Useful To Catalog

The user profile also exposes supporting state that Catalog may use later if needed:

- avatar technical processing state
- avatar validation technical processing state
- `isAvatarVerified`
- `lastAvatarValidationScore`
- `lastAvatarValidationAt`
- premium object

These are available as supporting metadata, but the normalized `signals` block should be the default integration point.

## Operational Notes

- City is required for a complete user profile.
- Coordinates are optional, but when present they must be sent as a complete latitude/longitude pair.
- Avatar validation runs asynchronously through Redis and BullMQ.
- Email is the current notification channel implementation.
- Notifications are already abstracted behind a notifications module so a future external notifications API can replace email without changing the avatar verification flow.

## Explicit Non-Goals In This Phase

- no ranking logic in Identity
- no reputation table in Identity
- no reputation score persisted in `User`
- no reputation score persisted in `UserProfile`
- no product or publication logic inside Identity
