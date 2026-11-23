# Notely Firestore Security Specification (Phase 0)

## 1. Data Invariants & Relationship Mapping
- **Master Source of Truth**: `/users/{userId}` is the root workspace document for each authenticated, email-verified **Google Sign-In** user (`request.auth.uid == userId && request.auth.token.email_verified == true && request.auth.token.firebase.sign_in_provider == 'google.com'`).
- **Google-Provider Enforcement**: Non-Google auth providers (anonymous, password, custom tokens) are rejected at the Firestore rule layer even if the public Firebase Web API key is extracted.
- **Strict Single-Tenant User Isolation**: No user may read, list, create, update, or delete another user's `/users/{userId}` document or any subcollection document (`/tabs`, `/categories`, `/templates`).
- **Master Gate**: Every single-document subcollection operation (`get`, `create`, `update`, `delete`) verifies that the parent `/users/{userId}` document exists. Every `list` operation evaluates `resource.data.ownerId == request.auth.uid` without calling `get()`/`exists()`.
- **Zero-Knowledge End-to-End Encryption Metadata**: Optional `encryptionEnabled`, `encryptionSalt`, and `encryptionVerifier` fields store only the random PBKDF2 salt and encrypted sentinel—never the user's passphrase or AES key. When `encryptionEnabled == true`, both `encryptionSalt` and `encryptionVerifier` must match strict regex formats.
- **No PII Storage**: User email, display name, and avatar are read directly from Firebase Auth in memory and never stored in Firestore.
- **Immutability & Temporal Integrity**: `ownerId` and `createdAt` are strictly immutable after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
- **Bounded Sizes & Strict Keys**: Every string has an explicit `.size()` bound; `tags` is strictly bounded to `<= 15` items with element type & size validation (`<= 256` chars for encrypted tags); shadow/ghost fields are blocked on both create (`hasOnly`) and update (`affectedKeys().hasOnly`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Read (`GET /users/victimUid`)**: Authenticated as `attackerUid`, attempts to read `victimUid`'s settings -> MUST return `PERMISSION_DENIED`.
2. **Cross-User Subcollection List (`LIST /users/victimUid/templates`)**: Authenticated as `attackerUid`, attempts to list `victimUid`'s templates -> MUST return `PERMISSION_DENIED`.
3. **Non-Google / Unverified Auth Write**: Anonymous or `email_verified: false` caller attempts to create `/users/{uid}` -> MUST return `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: Authenticated as `userA`, creates `/users/userA/tabs/tab1` with `ownerId: "userB"` -> MUST return `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Create**: Creates `/users/userA` with extra field `isAdmin: true` -> MUST return `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection on Update**: Updates `/users/userA/templates/tpl1` adding `role: "admin"` -> MUST return `PERMISSION_DENIED`.
7. **Immutable Field Tampering (`ownerId` / `createdAt`)**: Updates `/users/userA/templates/tpl1` changing `createdAt` or `ownerId` -> MUST return `PERMISSION_DENIED`.
8. **Client-Forged Timestamp**: Creates `/users/userA/tabs/tab1` with client-supplied past timestamp instead of `request.time` -> MUST return `PERMISSION_DENIED`.
9. **ID Poisoning Attack**: Attempts to create `/users/userA/templates/<1500-char-invalid-id>` -> MUST return `PERMISSION_DENIED`.
10. **Value Poisoning / Denial of Wallet (Oversized Content)**: Updates `content` to a 150,000-character string (>120,000 limit) or wrong type (`content: 12345`) -> MUST return `PERMISSION_DENIED`.
11. **Malformed E2EE State Injection**: Updates `/users/userA` setting `encryptionEnabled: true` with empty or malformed `encryptionSalt` / `encryptionVerifier` -> MUST return `PERMISSION_DENIED`.
12. **Orphaned Subcollection Write**: Creates `/users/userA/tabs/tab1` when parent `/users/userA` document does not exist -> MUST return `PERMISSION_DENIED`.
